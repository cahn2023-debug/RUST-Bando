use rstar::{RTree, RTreeObject, AABB};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialFeature {
    pub id: String,
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl RTreeObject for SpatialFeature {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners([self.min_x, self.min_y], [self.max_x, self.max_y])
    }
}

pub struct SpatialIndex {
    tree: RTree<SpatialFeature>,
}

impl SpatialIndex {
    pub fn new() -> Self {
        Self { tree: RTree::new() }
    }

    pub fn insert(&mut self, feature: SpatialFeature) {
        self.tree.insert(feature);
    }

    pub fn remove(&mut self, _feature_id: &str) {
        // RTree của rstar không hỗ trợ xóa trực tiếp theo ID một cách hiệu quả nếu không có tọa độ.
        // Trong kiến trúc thực tế, chúng ta thường clear và rebuild hoặc dùng cấu trúc khác.
        // Tạm thời để skeleton.
    }

    pub fn query_viewport(&self, min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> Vec<String> {
        let envelope = AABB::from_corners([min_x, min_y], [max_x, max_y]);
        self.tree
            .locate_in_envelope(&envelope)
            .map(|f| f.id.clone())
            .collect()
    }

    pub fn clear(&mut self) {
        self.tree = RTree::new();
    }
}
