ANIME REALITY — background video asset

Included: assets/anime-background.mp4
Duration: 38 seconds
Resolution: 1280 x 720 (HD 720p)
Format: MP4 / H.264 / silent / suitable for looping
Created from the 19 anime images supplied in this conversation.

The latest index.html in GitHub now has responsive background-video positioning centered on phones, tablets, and desktop screens. To use this montage on the live site, upload this MP4 into the repository at:

assets/anime-background.mp4

Then change the source in index.html from the current external Pexels URL to:
assets/anime-background.mp4

Keep autoplay muted loop playsinline on the video element so mobile browsers can autoplay it. The video uses object-fit: cover and centered positioning, so it fills the screen without anchoring to the left or right; portrait screens crop the sides by design.

Note: The responsive CSS has been committed to GitHub. This ZIP contains the video asset, but the binary itself has not yet been uploaded to the repository, so the live site will continue using its current background video until the asset is uploaded and the source path is changed.
