# Third-party components and model choices

- UI components in frontend/src/components/ui were retrieved from the official [shadcn/ui registry](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui), MIT license. The registry's `cn` import was resolved to the local alias.
- React, Vite, Tailwind CSS, Radix UI, lucide-react, Sonner: see their installed package licenses.
- Noto Sans Thai (backend/assets/fonts): Google Noto project, SIL Open Font License 1.1; license text accompanies the font. Frontend font packages carry their own OFL files.
- The sample landscape images are original procedural demo illustrations, not AI-generated output and not representations of completed generation jobs.
- FFmpeg is an external dependency. Licensing depends on the build configuration (including libx264). This repository does not bundle FFmpeg executables.
- Gemini: remote service, governed by Google's current API terms, pricing, data policies and model availability. No commercial-use or free-tier guarantee is made here.
- Qwen3, Whisper, and Stable Diffusion checkpoints are not bundled. Select exact files, record hash/version, and verify their model cards and licenses. The runtime's software license does not grant rights to arbitrary model weights.
- Official Vulkan references: [llama.cpp build](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md#vulkan), [whisper.cpp](https://github.com/ggml-org/whisper.cpp#vulkan-gpu-support), [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp).
