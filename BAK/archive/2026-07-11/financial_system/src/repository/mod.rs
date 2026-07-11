// src/repository/mod.rs

use sqlx::{Pool, Postgres, Transaction};
use crate::domain::{Project, OutputContract, InputContract, Allocation, AllocationRequest};
use rust_decimal::Decimal;
use anyhow::Result;

pub struct Repository {
    pool: Pool<Postgres>,
}

impl Repository {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }

    // --- Projects ---
    pub async fn create_project(&self, name: &str, description: Option<&str>) -> Result<Project> {
        let project = sqlx::query_as!(
            Project,
            "INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *",
            name,
            description
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(project)
    }

    // --- Allocations with Transaction & Locking ---
    pub async fn allocate_amount(&self, req: AllocationRequest) -> Result<Allocation> {
        let mut tx = self.pool.begin().await?;

        // 1. Lock the InputItem using SELECT FOR UPDATE to prevent race conditions
        let input_item = sqlx::query!(
            "SELECT id, actual_cost FROM input_items WHERE id = $1 FOR UPDATE",
            req.input_item_id
        )
        .fetch_one(&mut *tx)
        .await?;

        // 2. Check current total allocation for this input item
        let current_allocated: Option<Decimal> = sqlx::query_scalar!(
            "SELECT SUM(allocated_amount) FROM allocations WHERE input_item_id = $1",
            req.input_item_id
        )
        .fetch_one(&mut *tx)
        .await?;

        let total_after = current_allocated.unwrap_or(Decimal::ZERO) + req.amount;

        // 3. ENFORCE HARD CONSTRAINT: sum(allocated_amount) <= actual_cost
        if total_after > input_item.actual_cost {
            return Err(anyhow::anyhow!(
                "Over-allocation detected: Current {} + New {} > Actual Cost {}",
                current_allocated.unwrap_or(Decimal::ZERO),
                req.amount,
                input_item.actual_cost
            ));
        }

        // 4. Create the allocation
        let allocation = sqlx::query_as!(
            Allocation,
            "INSERT INTO allocations (input_item_id, output_item_id, allocated_amount) 
             VALUES ($1, $2, $3) RETURNING *",
            req.input_item_id,
            req.output_item_id,
            req.amount
        )
        .fetch_one(&mut *tx)
        .await?;

        // 5. Log the action (Audit Log)
        sqlx::query!(
            "INSERT INTO audit_logs (entity_type, entity_id, action, new_value) 
             VALUES ('allocation', $1, 'create', $2)",
            allocation.id,
            serde_json::to_value(&allocation).unwrap_or_default()
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(allocation)
    }

    pub async fn get_project_summary(&self, project_id: i32) -> Result<serde_json::Value> {
        let summary = sqlx::query!(
            r#"
            SELECT 
                COALESCE(SUM(oc.total_planned_value), 0) as total_revenue,
                COALESCE(SUM(ic.total_actual_cost), 0) as total_cost,
                (COALESCE(SUM(oc.total_planned_value), 0) - COALESCE(SUM(ic.total_actual_cost), 0)) as profit
            FROM projects p
            LEFT JOIN output_contracts oc ON oc.project_id = p.id
            LEFT JOIN input_contracts ic ON ic.project_id = p.id
            WHERE p.id = $1
            GROUP BY p.id
            "#,
            project_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(serde_json::json!({
            "total_revenue": summary.total_revenue,
            "total_cost": summary.total_cost,
            "profit": summary.profit
        }))
    }

    pub async fn get_output_view(&self, contract_id: i32) -> Result<serde_json::Value> {
        let items = sqlx::query!(
            r#"
            SELECT 
                oi.item_name,
                oi.planned_value,
                COALESCE(SUM(a.allocated_amount), 0) as actual_cost,
                (oi.planned_value - COALESCE(SUM(a.allocated_amount), 0)) as variance
            FROM output_items oi
            LEFT JOIN allocations a ON a.output_item_id = oi.id
            WHERE oi.contract_id = $1
            GROUP BY oi.id, oi.item_name, oi.planned_value
            "#,
            contract_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(serde_json::to_value(items)?)
    }

    pub async fn get_input_view(&self, contract_id: i32) -> Result<serde_json::Value> {
        let items = sqlx::query!(
            r#"
            SELECT 
                ii.item_name,
                ii.actual_cost,
                COALESCE(SUM(a.allocated_amount), 0) as allocated,
                (ii.actual_cost - COALESCE(SUM(a.allocated_amount), 0)) as remaining
            FROM input_items ii
            LEFT JOIN allocations a ON a.input_item_id = ii.id
            WHERE ii.contract_id = $1
            GROUP BY ii.id, ii.item_name, ii.actual_cost
            "#,
            contract_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(serde_json::to_value(items)?)
    }
}
