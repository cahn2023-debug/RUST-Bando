-- migrations/20260321_init_pfms.sql

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE output_contracts (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    contract_number VARCHAR(100) UNIQUE NOT NULL,
    client_name VARCHAR(255),
    total_planned_value NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE output_items (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES output_contracts(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    planned_value NUMERIC(19,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE input_contracts (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    contract_number VARCHAR(100) UNIQUE NOT NULL,
    vendor_name VARCHAR(255),
    total_actual_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE input_items (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES input_contracts(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    actual_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE allocations (
    id SERIAL PRIMARY KEY,
    input_item_id INTEGER REFERENCES input_items(id) ON DELETE CASCADE,
    output_item_id INTEGER REFERENCES output_items(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prevent_zero_allocation CHECK (allocated_amount > 0)
);

CREATE TABLE file_registry (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    actor_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_allocation_input_item ON allocations(input_item_id);
CREATE INDEX idx_allocation_output_item ON allocations(output_item_id);
CREATE INDEX idx_output_item_contract ON output_items(contract_id);
CREATE INDEX idx_input_item_contract ON input_items(contract_id);
