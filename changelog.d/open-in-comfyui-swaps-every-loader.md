- Open in ComfyUI now puts in the PixlStash loaders for more of the graph.
  Load VAE and Load CLIP load their file off your model shelf, and so does
  Load Diffusion Model when ComfyUI runs on the same computer. A Load Image
  whose picture is in your library becomes the PixlStash Picture Loader on
  that picture, and one naming a file ComfyUI does not have becomes an empty
  Picture Loader for you to browse in. Save Video becomes the PixlStash Video Saver on newer ComfyUI
  versions too, encoding with the saver's default codec in place of the one
  the node had.
