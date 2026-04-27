use crate::geometry::types::{Point, Segment};

pub fn project_point_to_segment(p: Point, s: Segment) -> Point {
    let (p1, p2) = (s.start, s.end);
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;

    if dx == 0.0 && dy == 0.0 {
        return p1;
    }

    let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);

    if t < 0.0 {
        p1
    } else if t > 1.0 {
        p2
    } else {
        Point::new(p1.x + t * dx, p1.y + t * dy)
    }
}

pub fn point_segment_distance(p: Point, s: Segment) -> f64 {
    let projected = project_point_to_segment(p, s);
    p.distance_to(&projected)
}
