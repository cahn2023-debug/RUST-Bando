use crate::geometry::types::Point;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GeometryAction {
    AddVertex {
        polyline_id: String,
        index: usize,
        point: Point,
    },
    MoveVertex {
        polyline_id: String,
        index: usize,
        old_point: Point,
        new_point: Point,
    },
    DeleteVertex {
        polyline_id: String,
        index: usize,
        point: Point,
    },
}

pub struct History {
    pub undo_stack: Vec<GeometryAction>,
    pub redo_stack: Vec<GeometryAction>,
}

impl Default for History {
    fn default() -> Self {
        Self::new()
    }
}

impl History {
    pub fn new() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    pub fn push(&mut self, action: GeometryAction) {
        self.undo_stack.push(action);
        self.redo_stack.clear(); // Clear redo when a new action is performed
    }

    pub fn undo(&mut self) -> Option<GeometryAction> {
        if let Some(action) = self.undo_stack.pop() {
            let inverse = match action.clone() {
                GeometryAction::AddVertex {
                    polyline_id,
                    index,
                    point,
                } => GeometryAction::DeleteVertex {
                    polyline_id,
                    index,
                    point,
                },
                GeometryAction::MoveVertex {
                    polyline_id,
                    index,
                    old_point,
                    new_point,
                } => GeometryAction::MoveVertex {
                    polyline_id,
                    index,
                    old_point: new_point,
                    new_point: old_point,
                },
                GeometryAction::DeleteVertex {
                    polyline_id,
                    index,
                    point,
                } => GeometryAction::AddVertex {
                    polyline_id,
                    index,
                    point,
                },
            };
            self.redo_stack.push(action);
            Some(inverse)
        } else {
            None
        }
    }

    pub fn redo(&mut self) -> Option<GeometryAction> {
        if let Some(action) = self.redo_stack.pop() {
            self.undo_stack.push(action.clone());
            Some(action)
        } else {
            None
        }
    }
}
