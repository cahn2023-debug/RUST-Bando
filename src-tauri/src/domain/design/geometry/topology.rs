use crate::geometry::types::{BoundingBox, Point, Polyline, Segment};

pub fn segments_intersect(s1: &Segment, s2: &Segment) -> bool {
    let (p1, p2) = (s1.start, s1.end);
    let (p3, p4) = (s2.start, s2.end);

    // Bounding Box check (Early exit)
    let bb1 = BoundingBox::from_points(&[p1, p2]);
    let bb2 = BoundingBox::from_points(&[p3, p4]);
    if !bb1.intersects(&bb2) {
        return false;
    }

    fn ccw(a: Point, b: Point, c: Point) -> bool {
        (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x)
    }

    ccw(p1, p3, p4) != ccw(p2, p3, p4) && ccw(p1, p2, p3) != ccw(p1, p2, p4)
}

pub fn has_self_intersection(polyline: &Polyline) -> bool {
    let segments = polyline.segments();
    let len = segments.len();
    if len < 2 {
        return false;
    }

    for i in 0..len {
        for j in (i + 2)..len {
            // Check if they share a vertex (neighbors)
            // In a simple open polyline, i and j are neighbors only if |i-j| == 1.
            // In a closed polyline (Polygon), 0 and len-1 also share a vertex.
            let is_closed_neighbor = i == 0
                && j == len - 1
                && polyline.points[0] == polyline.points[polyline.points.len() - 1];

            if is_closed_neighbor {
                continue;
            }

            if segments_intersect(&segments[i], &segments[j]) {
                return true;
            }
        }
    }
    false
}
