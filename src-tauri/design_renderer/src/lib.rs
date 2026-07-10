use bytemuck::{Pod, Zeroable};
use rstar::{RTree, RTreeObject, AABB};
use app_domain::{DeltaMapData, Entity, EntityType, MapData};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;
use wgpu::{util::DeviceExt, Backends, InstanceDescriptor, InstanceFlags};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
    color: [f32; 4],
}

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
struct CameraUniform {
    view_proj: [[f32; 4]; 4],
}

impl CameraUniform {
    fn new() -> Self {
        use cgmath::SquareMatrix;
        Self {
            view_proj: cgmath::Matrix4::identity().into(),
        }
    }
}

pub struct SpatialEntity {
    pub id: String,
    pub envelope: AABB<[f32; 2]>,
}

impl RTreeObject for SpatialEntity {
    type Envelope = AABB<[f32; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

fn calculate_envelope(entity: &Entity) -> AABB<[f32; 2]> {
    match &entity.entity_type {
        EntityType::Line { start, end } => {
            let min_x = start.x.min(end.x);
            let max_x = start.x.max(end.x);
            let min_y = start.y.min(end.y);
            let max_y = start.y.max(end.y);
            AABB::from_corners([min_x, min_y], [max_x, max_y])
        }
        EntityType::Rect {
            top_left,
            width,
            height,
        } => {
            let br_x = top_left.x + width;
            let br_y = top_left.y + height;
            AABB::from_corners([top_left.x, top_left.y], [br_x, br_y])
        }
        EntityType::Circle { center, radius } => {
            let min_x = center.x - radius;
            let max_x = center.x + radius;
            let min_y = center.y - radius;
            let max_y = center.y + radius;
            AABB::from_corners([min_x, min_y], [max_x, max_y])
        }
        EntityType::Text { position, .. } => {
            // Placeholder for text bounding box
            AABB::from_corners([position.x, position.y], [position.x + 10.0, position.y + 10.0])
        }
    }
}

#[wasm_bindgen]
pub struct RendererState {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    render_pipeline: wgpu::RenderPipeline,
    map_data_map: HashMap<String, Entity>,
    rtree: RTree<SpatialEntity>,
    camera_uniform: CameraUniform,
    camera_buffer: wgpu::Buffer,
    camera_bind_group: wgpu::BindGroup,
    vertex_buffer: wgpu::Buffer,
    vertex_buffer_capacity: usize,
    index_buffer: wgpu::Buffer,
    index_buffer_capacity: usize,
    num_indices: u32,
    viewport_aabb: AABB<[f32; 2]>,
}

#[wasm_bindgen]
impl RendererState {
    #[wasm_bindgen]
    #[allow(unused_variables)]
    #[allow(unreachable_code)]
    pub async fn create(
        canvas: HtmlCanvasElement,
        force_webgl: bool,
    ) -> Result<RendererState, JsValue> {
        console_error_panic_hook::set_once();

        let width = canvas.width();
        let height = canvas.height();
        let size = winit::dpi::PhysicalSize::new(width, height);

        let backends = if force_webgl {
            console_log!("[WGPU] Forcing WebGL2 Backend Configuration...");
            Backends::GL
        } else {
            console_log!("[WGPU] Primary Backend Configuration: Requesting Backends::all()...");
            Backends::all()
        };

        let instance = wgpu::Instance::new(InstanceDescriptor {
            backends,
            flags: InstanceFlags::default(),
            dx12_shader_compiler: Default::default(),
            gles_minor_version: wgpu::Gles3MinorVersion::Automatic,
        });

        #[cfg(target_arch = "wasm32")]
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|e| JsValue::from_str(&format!("Failed to create surface: {:?}", e)))?;

        #[cfg(not(target_arch = "wasm32"))]
        let surface = panic!("Design renderer is intended for WASM but was compiled for native. SurfaceTarget::Canvas is unavailable.");

        async fn try_init(
            instance: &wgpu::Instance,
            surface: &wgpu::Surface<'static>,
        ) -> Option<(wgpu::Adapter, wgpu::Device, wgpu::Queue)> {
            let adapter = instance
                .request_adapter(&wgpu::RequestAdapterOptions {
                    power_preference: wgpu::PowerPreference::default(),
                    compatible_surface: Some(surface),
                    force_fallback_adapter: false,
                })
                .await?;

            let adapter_info = adapter.get_info();
            console_log!(
                "[WGPU] Adapter: {}, Backend: {:?}, Driver: {}",
                adapter_info.name,
                adapter_info.backend,
                adapter_info.driver
            );

            let stages = [
                (adapter.limits(), "Highest Adapter Limits"),
                (wgpu::Limits::default(), "WGPU Standard Defaults"),
                (
                    wgpu::Limits::downlevel_webgl2_defaults(),
                    "WebGL2 Safe Defaults",
                ),
                (
                    wgpu::Limits::downlevel_defaults(),
                    "Ultra-Safe Downlevel Defaults",
                ),
            ];

            for (limits, label) in stages {
                console_log!("[WGPU] Attempting initialization with stage: {}", label);
                if let Ok(dq) = adapter
                    .request_device(
                        &wgpu::DeviceDescriptor {
                            required_features: wgpu::Features::empty(),
                            required_limits: limits,
                            label: Some(label),
                            memory_hints: Default::default(),
                        },
                        None,
                    )
                    .await
                {
                    console_log!("[WGPU] Success: {} limits used", label);
                    return Some((adapter, dq.0, dq.1));
                }
            }
            None
        }

        let init_result = try_init(&instance, &surface).await;

        let (adapter, device, queue) = init_result.ok_or_else(|| {
            let msg = if force_webgl {
                "Fatal: WGPU Failed to initialize on WebGL2 backend. Hardware acceleration unavailable."
            } else {
                "Fatal: WGPU Failed to initialize on WebGPU backend. Please use force_webgl fallback."
            };
            JsValue::from_str(msg)
        })?;

        let surface_caps = surface.get_capabilities(&adapter);
        let surface_format = surface_caps
            .formats
            .iter()
            .copied()
            .find(|f: &wgpu::TextureFormat| f.is_srgb())
            .unwrap_or(surface_caps.formats[0]);

        // Tìm kiếm alpha mode phù hợp để hỗ trợ transparency (hợp nhất với Leaflet)
        let alpha_mode = if surface_caps
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PreMultiplied)
        {
            wgpu::CompositeAlphaMode::PreMultiplied
        } else if surface_caps
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PostMultiplied)
        {
            wgpu::CompositeAlphaMode::PostMultiplied
        } else {
            surface_caps.alpha_modes[0]
        };

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: surface_caps.present_modes[0],
            alpha_mode,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        // Load Shader and Create Pipeline
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("CAD Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        let camera_uniform = CameraUniform::new();
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Camera Buffer"),
            contents: bytemuck::cast_slice(&[camera_uniform]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let camera_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
                label: Some("camera_bind_group_layout"),
            });

        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
            label: Some("camera_bind_group"),
        });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Render Pipeline Layout"),
                bind_group_layouts: &[&camera_bind_group_layout],
                push_constant_ranges: &[],
            });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                compilation_options: Default::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x4],
                }],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::LineList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let vertex_buffer_capacity = 10000;
        let vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Vertex Buffer Pool"),
            size: (vertex_buffer_capacity * std::mem::size_of::<Vertex>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let index_buffer_capacity = 20000;
        let index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Index Buffer Pool"),
            size: (index_buffer_capacity * std::mem::size_of::<u32>()) as u64,
            usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        console_log!("WGPU Renderer Core Ready (Buffer Pool Initialized)");

        Ok(Self {
            surface,
            device,
            queue,
            config,
            size,
            render_pipeline,
            map_data_map: HashMap::new(),
            rtree: RTree::new(),
            camera_uniform,
            camera_buffer,
            camera_bind_group,
            vertex_buffer,
            vertex_buffer_capacity,
            index_buffer,
            index_buffer_capacity,
            num_indices: 0,
            viewport_aabb: AABB::from_corners([-1000.0, -1000.0], [1000.0, 1000.0]), // Initial broad viewport
        })
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, new_width: u32, new_height: u32) {
        if new_width > 0 && new_height > 0 {
            self.size.width = new_width;
            self.size.height = new_height;
            self.config.width = new_width;
            self.config.height = new_height;
            self.surface.configure(&self.device, &self.config);
        }
    }

    #[wasm_bindgen]
    pub fn load_map_data(&mut self, buffer: &[u8]) -> Result<(), JsValue> {
        match bincode::deserialize::<MapData>(buffer) {
            Ok(data) => {
                // Build R-Tree index and Map
                let mut spatial_entities = Vec::new();
                let mut entities_map = HashMap::new();
                
                for entity in data.entities {
                    spatial_entities.push(SpatialEntity {
                        id: entity.id.clone(),
                        envelope: calculate_envelope(&entity),
                    });
                    entities_map.insert(entity.id.clone(), entity);
                }
                
                self.rtree = RTree::bulk_load(spatial_entities);
                self.map_data_map = entities_map;
                
                self.update_buffers();
                Ok(())
            }
            Err(e) => {
                let err_msg = format!("Failed to deserialize map data: {:?}", e);
                console_log!("{}", err_msg);
                Err(JsValue::from_str(&err_msg))
            }
        }
    }

    #[wasm_bindgen]
    pub fn load_delta_map_data(&mut self, buffer: &[u8]) -> Result<(), JsValue> {
        match bincode::deserialize::<DeltaMapData>(buffer) {
            Ok(delta) => {
                // Remove deleted
                for id in delta.delete_ids {
                    self.map_data_map.remove(&id);
                }
                
                // Upsert new/updated
                for new_entity in delta.upsert_entities {
                    self.map_data_map.insert(new_entity.id.clone(), new_entity);
                }
                
                // Rebuild R-Tree
                let mut spatial_entities = Vec::new();
                for entity in self.map_data_map.values() {
                    spatial_entities.push(SpatialEntity {
                        id: entity.id.clone(),
                        envelope: calculate_envelope(entity),
                    });
                }
                self.rtree = RTree::bulk_load(spatial_entities);
                
                self.update_buffers();
                Ok(())
            }
            Err(e) => {
                let err_msg = format!("Failed to deserialize delta map data: {:?}", e);
                console_log!("{}", err_msg);
                Err(JsValue::from_str(&err_msg))
            }
        }
    }

    fn update_buffers(&mut self) {
        if self.map_data_map.is_empty() {
            return;
        }

        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let mut current_idx = 0u32;

        // Query R-Tree for visible entities (Frustum Culling)
        let visible_entities = self.rtree.locate_in_envelope(&self.viewport_aabb);

        for spatial_entity in visible_entities {
            if let Some(entity) = self.map_data_map.get(&spatial_entity.id) {
                let color = [
                    entity.color.r,
                    entity.color.g,
                    entity.color.b,
                    entity.color.a,
                ];
            match &entity.entity_type {
                EntityType::Line { start, end } => {
                    vertices.push(Vertex {
                        position: [start.x, start.y],
                        color,
                    });
                    vertices.push(Vertex {
                        position: [end.x, end.y],
                        color,
                    });
                    indices.push(current_idx);
                    indices.push(current_idx + 1);
                    current_idx += 2;
                }
                EntityType::Rect {
                    top_left,
                    width,
                    height,
                } => {
                    let tl = [top_left.x, top_left.y];
                    let tr = [top_left.x + *width, top_left.y];
                    let bl = [top_left.x, top_left.y + *height];
                    let br = [top_left.x + *width, top_left.y + *height];

                    vertices.push(Vertex {
                        position: tl,
                        color,
                    });
                    vertices.push(Vertex {
                        position: tr,
                        color,
                    });
                    vertices.push(Vertex {
                        position: br,
                        color,
                    });
                    vertices.push(Vertex {
                        position: bl,
                        color,
                    });

                    indices.push(current_idx);
                    indices.push(current_idx + 1);
                    indices.push(current_idx + 1);
                    indices.push(current_idx + 2);
                    indices.push(current_idx + 2);
                    indices.push(current_idx + 3);
                    indices.push(current_idx + 3);
                    indices.push(current_idx);
                    current_idx += 4;
                }
                EntityType::Circle { center, radius } => {
                    let segments = 32;
                    for i in 0..segments {
                        let angle1 = 2.0 * std::f32::consts::PI * (i as f32) / (segments as f32);
                        let angle2 =
                            2.0 * std::f32::consts::PI * ((i + 1) as f32) / (segments as f32);

                        let p1 = [
                            center.x + radius * angle1.cos(),
                            center.y + radius * angle1.sin(),
                        ];
                        let p2 = [
                            center.x + radius * angle2.cos(),
                            center.y + radius * angle2.sin(),
                        ];

                        vertices.push(Vertex {
                            position: p1,
                            color,
                        });
                        vertices.push(Vertex {
                            position: p2,
                            color,
                        });
                        indices.push(current_idx);
                        indices.push(current_idx + 1);
                        current_idx += 2;
                    }
                }
                _ => {
                    console_log!(
                        "[WASM] Unsupported entity type for rendering: {:?}",
                        entity.entity_type
                    );
                }
                }
            }
        }

        if vertices.is_empty() {
            self.num_indices = 0;
            return;
        }

        // Check if we need to resize buffers
        if vertices.len() > self.vertex_buffer_capacity {
            self.vertex_buffer_capacity = (vertices.len() * 2).max(self.vertex_buffer_capacity * 2);
            self.vertex_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Vertex Buffer Pool Expanded"),
                size: (self.vertex_buffer_capacity * std::mem::size_of::<Vertex>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            console_log!("[WASM] Vertex buffer expanded to {} vertices", self.vertex_buffer_capacity);
        }

        if indices.len() > self.index_buffer_capacity {
            self.index_buffer_capacity = (indices.len() * 2).max(self.index_buffer_capacity * 2);
            self.index_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Index Buffer Pool Expanded"),
                size: (self.index_buffer_capacity * std::mem::size_of::<u32>()) as u64,
                usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            console_log!("[WASM] Index buffer expanded to {} indices", self.index_buffer_capacity);
        }

        // Upload data using efficient copy_dst
        self.queue.write_buffer(&self.vertex_buffer, 0, bytemuck::cast_slice(&vertices));
        self.queue.write_buffer(&self.index_buffer, 0, bytemuck::cast_slice(&indices));

        self.num_indices = indices.len() as u32;
        console_log!(
            "[WASM] Buffers uploaded via Pool. Visible: {}, Indices: {}",
            self.map_data_map.len(),
            self.num_indices
        );
    }

    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        let output = self
            .surface
            .get_current_texture()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Render Encoder"),
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 0.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            {
                render_pass.set_pipeline(&self.render_pipeline);
                render_pass.set_bind_group(0, &self.camera_bind_group, &[]);
                render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
                render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
                render_pass.draw_indexed(0..self.num_indices, 0, 0..1);
            }
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();

        Ok(())
    }

    #[wasm_bindgen]
    pub fn update_camera(&mut self, matrix: &[f32]) {
        if matrix.len() == 16 {
            let mut data = [[0.0f32; 4]; 4];
            for i in 0..4 {
                for j in 0..4 {
                    data[i][j] = matrix[i * 4 + j];
                }
            }
            self.camera_uniform.view_proj = data;
            self.queue.write_buffer(&self.camera_buffer, 0, bytemuck::cast_slice(&[self.camera_uniform]));
        }
    }

    #[wasm_bindgen]
    pub fn set_viewport(&mut self, min_x: f32, min_y: f32, max_x: f32, max_y: f32) {
        self.viewport_aabb = AABB::from_corners([min_x, min_y], [max_x, max_y]);
        self.update_buffers(); // Trigger culling update
    }
}
