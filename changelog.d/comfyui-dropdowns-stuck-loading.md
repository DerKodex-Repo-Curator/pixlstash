- Fixed: in ComfyUI, a new PixlStash node's dropdowns (project, set, person,
  workflow set, and the adapter loaders' base model) no longer stay on
  "(loading…)" after the list has arrived; they show "— None —" until you
  pick something.
- Fixed: a workflow opened in ComfyUI from PixlStash sometimes showed its
  Checkpoint, ControlNet, VAE, text encoder or LoRA loader as "Browse…" with
  nothing picked, though it had a file. Picture Loader previews and the Multi
  Adapter Loader's rows had the same problem.
- Changed: the ComfyUI adapter loaders' base model picks a family, so "Krea 2"
  finds the Krea 2 Raw and Turbo LoRAs too, and on a workflow opened from
  PixlStash it starts on the family of that workflow's checkpoint.
