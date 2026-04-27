#[cfg(test)]
mod tests {
    use crate::geometry::commands::{GeometryAction, History};
    use crate::geometry::snapping::project_point_to_segment;
    use crate::geometry::topology::{has_self_intersection, segments_intersect};
    use crate::geometry::types::{Point, Polyline, Segment};

    #[test]
    fn test_point_distance() {
        let p1 = Point::new(0.0, 0.0);
        let p2 = Point::new(3.0, 4.0);
        assert_eq!(p1.distance_to(&p2), 5.0);
    }

    #[test]
    fn test_segment_intersection() {
        let s1 = Segment::new(Point::new(0.0, 0.0), Point::new(10.0, 10.0));
        let s2 = Segment::new(Point::new(0.0, 10.0), Point::new(10.0, 0.0));
        assert!(segments_intersect(&s1, &s2));

        let s3 = Segment::new(Point::new(0.0, 0.0), Point::new(5.0, 5.0));
        let s4 = Segment::new(Point::new(6.0, 6.0), Point::new(10.0, 10.0));
        assert!(!segments_intersect(&s3, &s4));
    }

    #[test]
    fn test_self_intersection() {
        let p1 = Polyline::new(vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 10.0),
            Point::new(0.0, 10.0),
            Point::new(10.0, 0.0), // This crosses the first segment (0,0)-(10,10)
        ]);
        assert!(has_self_intersection(&p1));

        let p2 = Polyline::new(vec![
            Point::new(0.0, 0.0),
            Point::new(0.0, 10.0),
            Point::new(10.0, 10.0),
        ]);
        assert!(!has_self_intersection(&p2));
    }

    #[test]
    fn test_undo_redo_history() {
        let mut history = History::new();
        let action = GeometryAction::AddVertex {
            polyline_id: "test".to_string(),
            index: 0,
            point: Point::new(1.0, 2.0),
        };

        history.push(action);
        let undo_action = history.undo().unwrap();

        // Inverse of Add is Delete
        match undo_action {
            GeometryAction::DeleteVertex { index, .. } => assert_eq!(index, 0),
            _ => panic!("Expected DeleteVertex"),
        }

        let redo_action = history.redo().unwrap();
        match redo_action {
            GeometryAction::AddVertex { index, .. } => assert_eq!(index, 0),
            _ => panic!("Expected AddVertex"),
        }
    }

    #[test]
    fn test_snapping_projection() {
        let p = Point::new(5.0, 6.0);
        let s = Segment::new(Point::new(0.0, 0.0), Point::new(10.0, 0.0));
        let projected = project_point_to_segment(p, s);

        assert_eq!(projected.x, 5.0);
        assert_eq!(projected.y, 0.0);
    }
}
