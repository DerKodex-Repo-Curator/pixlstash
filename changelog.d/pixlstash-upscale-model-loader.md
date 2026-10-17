- The model shelf now lists your upscalers (`4x-UltraSharp.pth`,
  `RealESRGAN_x2.pth`, ...), as Upscalers under Support files, from an
  `upscale_models` folder (or A1111's `ESRGAN`, `RealESRGAN` and `SwinIR`).
  A PixlStash Upscale Model Loader in the ComfyUI-PixlStash nodes loads one
  off the shelf: a workflow whose upscaler is on the shelf but not in
  ComfyUI's folder no longer shows it as missing, and *Open in ComfyUI* puts
  the loader in too. Needs the ComfyUI-PixlStash nodes this version ships.
