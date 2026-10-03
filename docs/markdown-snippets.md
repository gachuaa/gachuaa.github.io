# Markdown cheat sheet

## Quick rules

### Spoiler / flag

```html
got <span class="spoiler">FLAG{your_flag_here}</span>
```

Use it when you want text hidden until clicked. The default left margin keeps it visually separated from the previous word.

To blur a small image or GIF until clicked, nest an image tag inside the spoiler span:

```html
<span class="spoiler"><img src="./image/reveal.gif" alt="Spoiler" width="160" role="button" tabindex="0" aria-label="Open full-size image"></span>
```

Keep the media in the writeup's `image/` folder. Click once to reveal the compact preview, then click the image again to zoom; press Enter or Space when focused. Press Escape or click outside the zoomed image to close it.

### Image inside a writeup

```markdown
![Alt text](./image/my-image.png)
```

Keep the file in the same writeup folder under `image/`.

Click any writeup image to open the full-size preview. Press Escape or click outside the preview to close it.

### Resize an image

Use an HTML image tag with a `width` in pixels. The site keeps it responsive on smaller screens.

```html
<img src="./image/my-image.png" alt="Alt text" width="600">
```

### Wrong pattern to avoid

```markdown
![Alt text](writeups/your-folder/image/my-image.png)
```

This often works in Obsidian but breaks on the generated site. Use a relative path instead.

## Copy-paste examples

```markdown
- tried some memcache enum, I guess what i got <span class="spoiler">FLAG{example_flag_here}</span>
```

```markdown
![Website](./image/Pasted%20image%2020261001213014.png)
```

## Remember

- spoiler = `got <span class="spoiler">...</span>`
- image = `./image/...`
- keep attachments next to the writeup's `index.md`
- do not use repo-root paths like `writeups/...` in markdown files
