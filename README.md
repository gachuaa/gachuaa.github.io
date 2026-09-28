# Gachuaa

Personal notes on cybersecurity, machine write-ups, Linux, and networking.

**Blog:** https://gachuaa.github.io/

Built with [Hugo](https://gohugo.io/) and [Stack](https://github.com/CaiJimmy/hugo-theme-stack), and published through GitHub Pages.

## Publish a post in your browser

1. Open `templates/machine-writeup.md` for a machine write-up, or `templates/blog-post.md` for a general article, and copy its contents.
2. From the repository root, choose **Add file → Create new file**.
3. Name the file `content/post/your-post-name/index.md` and paste the template.
4. Set the title, description, unique slug, date, category, and tags. Write your article beneath the second `---` line.
5. Change `draft: true` to `draft: false` when the article is ready.
6. Commit the changes to `master`. Check **Actions → Build and deploy** for the result.

Each post gets its own folder. To edit a published post, edit that folder's `index.md` and commit the change. To remove a post, delete its folder and commit.

`draft: true` excludes an article from the website; files in this public repository can still be read on GitHub. The files in `templates/` are not part of the website.

## Screenshots and covers

Open the post's folder, select **Add file → Upload files**, and upload your images. Use filenames without spaces, such as `nmap-results.png`.

```markdown
![Nmap scan results](nmap-results.png)
```

For an image on the homepage card, upload `cover.png` in the same folder and set this in the post's front matter:

```yaml
image: "cover.png"
```

## Topics

Use one or more of these exact category names in a post:

- `Machine Write-ups`
- `Web Security`
- `Linux`
- `Networking`

Example:

```yaml
categories: ["Web Security"]
tags: ["xss", "javascript"]
```

The topic descriptions live in `content/categories/`. Homepage shortcuts live in `data/topics.yaml`.

## Customize the blog

| Change | File |
|---|---|
| Site title, address, timezone | `config/_default/config.toml` |
| Tagline, avatar, light/dark mode, comments, widgets | `config/_default/params.toml` |
| GitHub and RSS links | `config/_default/menu.toml` |
| About page | `content/page/about/index.md` |
| Homepage introduction | `content/_index.md` and `layouts/home.html` |
| Colors, spacing, code styling | `assets/scss/custom.scss` |
| Current monogram and favicon | `assets/img/gachuaa.svg` |

To use a photo instead of the monogram, upload it to `assets/img/`, then set `[sidebar]` → `avatar` to its path without the `assets/` prefix. For example: `avatar = "img/my-avatar.png"`.

Keep the Search and Archives pages: they support the blog's navigation. The Stack theme attribution remains in the footer.

## Preview locally (optional)

Install Git, Go, and Hugo Extended. The tested Hugo version is pinned in `.github/workflows/deploy.yml`.

```sh
git clone https://github.com/gachuaa/gachuaa.github.io.git
cd gachuaa.github.io
hugo server -D
```

Open the local address printed by Hugo. `-D` includes drafts in the local preview.

## Theme updates

Theme updates run only when requested. In GitHub, open **Actions → Update theme → Run workflow**. If it changes the theme version, run **Build and deploy** afterward and check the site.

The template is based on [CaiJimmy's Stack starter](https://github.com/CaiJimmy/hugo-theme-stack-starter). Its license is retained in `LICENSE`; Stack is provided under its own GPL-3.0 license.
