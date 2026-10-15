- Fixed: the Model folders dialog labelled the HuggingFace cache as PixlStash's
  even when it held models PixlStash never downloaded. It now says HuggingFace
  unless everything in it is PixlStash's own, and folders belonging to
  StabilityMatrix, including its models folder reached through a symlink, are
  labelled StabilityMatrix.
