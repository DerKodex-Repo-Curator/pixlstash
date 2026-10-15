- A PixlStash ControlNet Loader in the ComfyUI-PixlStash nodes, which loads a
  ControlNet off your model shelf. A workflow whose ControlNet is on the shelf
  but not in ComfyUI's controlnet folder no longer shows it as missing: a run
  loads it through the new loader, fetching the file when ComfyUI is on
  another computer, and *Open in ComfyUI* puts the loader in too. The model
  shelf files what sits in a `controlnet` folder as a ControlNet, under
  Support files, rather than as a checkpoint. Needs the ComfyUI-PixlStash
  nodes this version ships.
