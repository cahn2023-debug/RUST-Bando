use crate::geometry::types::{Point, Segment};
#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

/// Calculates the distance between a point and a line segment using standard scalar math.
pub fn point_to_segment_distance(p: Point, s: Segment) -> f64 {
    let (vx, vy) = s.vector();
    let (wx, wy) = (p.x - s.start.x, p.y - s.start.y);

    let c1 = wx * vx + wy * vy;
    if c1 <= 0.0 {
        return p.distance_to(&s.start);
    }

    let c2 = vx * vx + vy * vy;
    if c2 <= c1 {
        return p.distance_to(&s.end);
    }

    let b = c1 / c2;
    let p_b = Point::new(s.start.x + b * vx, s.start.y + b * vy);
    p.distance_to(&p_b)
}

/// AVX2 implementation to calculate distances for 4 segments simultaneously.
/// This targets x86_64 architectures with AVX2 support.
///
/// # Safety
/// This function requires AVX2 CPU feature support. It will cause undefined behavior
/// if called on a CPU without AVX2 support. The `#[target_feature(enable = "avx2")]`
/// attribute ensures this at runtime, but the function must still be called through
/// a safe wrapper that checks CPU capabilities.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn point_to_segments_distances_avx2(
    px: f64,
    py: f64,
    sx: &[f64; 4], // start x
    sy: &[f64; 4], // start y
    ex: &[f64; 4], // end x
    ey: &[f64; 4], // end y
    results: &mut [f64; 4],
) {
    // Load point into registers
    let p_x = _mm256_set1_pd(px);
    let p_y = _mm256_set1_pd(py);

    // Load segment starts and ends
    let s_x = _mm256_loadu_pd(sx.as_ptr());
    let s_y = _mm256_loadu_pd(sy.as_ptr());
    let e_x = _mm256_loadu_pd(ex.as_ptr());
    let e_y = _mm256_loadu_pd(ey.as_ptr());

    // Vector V = E - S
    let v_x = _mm256_sub_pd(e_x, s_x);
    let v_y = _mm256_sub_pd(e_y, s_y);

    // Vector W = P - S
    let w_x = _mm256_sub_pd(p_x, s_x);
    let w_y = _mm256_sub_pd(p_y, s_y);

    // c1 = dot(W, V)
    let c1 = _mm256_add_pd(_mm256_mul_pd(w_x, v_x), _mm256_mul_pd(w_y, v_y));

    // c2 = dot(V, V)
    let c2 = _mm256_add_pd(_mm256_mul_pd(v_x, v_x), _mm256_mul_pd(v_y, v_y));

    // Masks for c1 <= 0 and c2 <= c1
    let zero = _mm256_setzero_pd();
    let mask_c1_le_zero = _mm256_cmp_pd(c1, zero, _CMP_LE_OQ);
    let mask_c2_le_c1 = _mm256_cmp_pd(c2, c1, _CMP_LE_OQ);

    // b = c1 / c2
    let b = _mm256_div_pd(c1, c2);

    // Pb_x = s_x + b * v_x
    // Pb_y = s_y + b * v_y
    let pb_x = _mm256_add_pd(s_x, _mm256_mul_pd(b, v_x));
    let pb_y = _mm256_add_pd(s_y, _mm256_mul_pd(b, v_y));

    // dx = p_x - pb_x, dy = p_y - pb_y
    let dx_mid = _mm256_sub_pd(p_x, pb_x);
    let dy_mid = _mm256_sub_pd(p_y, pb_y);
    let dist_sq_mid = _mm256_add_pd(_mm256_mul_pd(dx_mid, dx_mid), _mm256_mul_pd(dy_mid, dy_mid));

    // dist_sq_start = (p_x - s_x)^2 + (p_y - s_y)^2
    let dx_s = _mm256_sub_pd(p_x, s_x);
    let dy_s = _mm256_sub_pd(p_y, s_y);
    let dist_sq_s = _mm256_add_pd(_mm256_mul_pd(dx_s, dx_s), _mm256_mul_pd(dy_s, dy_s));

    // dist_sq_end = (p_x - e_x)^2 + (p_y - e_y)^2
    let dx_e = _mm256_sub_pd(p_x, e_x);
    let dy_e = _mm256_sub_pd(p_y, e_y);
    let dist_sq_e = _mm256_add_pd(_mm256_mul_pd(dx_e, dx_e), _mm256_mul_pd(dy_e, dy_e));

    // Blend results based on masks
    // If c1 <= 0 use dist_sq_s
    // Else if c2 <= c1 use dist_sq_e
    // Else use dist_sq_mid
    let mut final_dist_sq = _mm256_blendv_pd(dist_sq_mid, dist_sq_s, mask_c1_le_zero);
    final_dist_sq = _mm256_blendv_pd(final_dist_sq, dist_sq_e, mask_c2_le_c1);

    let final_dist = _mm256_sqrt_pd(final_dist_sq);
    _mm256_storeu_pd(results.as_mut_ptr(), final_dist);
}

/// Dispatches to the best available implementation for the current CPU.
pub fn batch_point_to_segment_distances(p: Point, segments: &[Segment]) -> Vec<f64> {
    let mut results = vec![0.0; segments.len()];

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            let mut sx = [0.0; 4];
            let mut sy = [0.0; 4];
            let mut ex = [0.0; 4];
            let mut ey = [0.0; 4];
            let mut chunk_res = [0.0; 4];

            let chunks = segments.chunks_exact(4);
            let rem = chunks.remainder();
            let mut offset = 0;

            for chunk in chunks {
                for i in 0..4 {
                    sx[i] = chunk[i].start.x;
                    sy[i] = chunk[i].start.y;
                    ex[i] = chunk[i].end.x;
                    ey[i] = chunk[i].end.y;
                }
                unsafe {
                    point_to_segments_distances_avx2(p.x, p.y, &sx, &sy, &ex, &ey, &mut chunk_res);
                }
                results[offset..offset + 4].copy_from_slice(&chunk_res);
                offset += 4;
            }

            for (i, seg) in rem.iter().enumerate() {
                results[offset + i] = point_to_segment_distance(p, *seg);
            }
            return results;
        }
    }

    // Fallback
    for (i, seg) in segments.iter().enumerate() {
        results[i] = point_to_segment_distance(p, *seg);
    }
    results
}
