/* The ocean is WebGPU and its shaders are modules, neither of which the base
   Astro tsconfig knows about:
     - @vgpu/wgsl/wgsl-types declares `*.wgsl` so the renderer's shader imports
       type as the loader artifact rather than `any`.
     - @webgpu/types supplies GPUTextureFormat, GPUSampler and navigator.gpu.
   Scoped to this folder's build via tsconfig "types", so nothing else on the
   site starts believing WebGPU is always present. */
/// <reference types="@vgpu/wgsl/wgsl-types" />
/// <reference types="@webgpu/types" />
