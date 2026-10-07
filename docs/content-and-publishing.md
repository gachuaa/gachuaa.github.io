# Content and GitHub Pages Guide

This site is a static Astro notebook. Write posts as Markdown under `content/`; the build validates them, prepares the published content, and creates the static website in `dist/`. The included GitHub Actions workflow deploys `dist/` to GitHub Pages whenever you push to `main`.

## Requirements

- Node.js 24
- npm
- A GitHub account and a repository for the site

Install dependencies once:

```bash
npm ci
```

## Content types and locations

Each entry lives in its own directory. `index.md` holds its metadata and Markdown body; `image/` holds local media; and an optional same-name `.canvas` file holds its Obsidian Canvas:

```text
content/
  notes/amaterasu/
    index.md
    amaterasu.canvas
    image/
      nmap.png
  writeups/amaterasu/
    index.md
    amaterasu.canvas
    image/
      nmap.png
  articles/http-request-anatomy/
    index.md
    image/
```

Write-up `index.md` files include a registered `platform` ID such as `offsec`.

The `slug` in frontmatter determines the public URL. The folder name is for organizing source files; it does not have to equal the slug.

- **Notes** are short, reusable references. Their nested folders form the Notes tree.
- **Write-ups** are lab walkthroughs grouped by platform, such as HTB or Vuln Labs.
- **Articles** are longer explanations, tutorials, and personal posts.

## Create content with the CLI

The CLI creates a draft, generates the correct template, and creates a local `image/` folder for attachments. Pass `--canvas` to also create a blank `<entry-name>.canvas` and associate it with the entry. Entries with a Canvas show Markdown and Canvas tabs. Drafts appear in local development but are not included in the production site.

### Note

```bash
npm run new -- --type note --root --title "Amaterasu" --description "Lab notes." --topics linux --canvas
```

Use `--root` for a top-level note such as `content/notes/amaterasu/`. To place notes in the Notes tree, use `--category` for the folder path. For a new folder, register it first:

```bash
npm run category -- --type folder --name "Reconnaissance" --parent web-security
```

Folder paths use lowercase hyphenated IDs. A top-level folder can be created without `--parent`.

### Write-up

Use a registered platform ID as the category. New write-up directories live directly under `content/writeups/`; the selected platform is stored in `index.md` frontmatter. Existing platform IDs are in `config/taxonomy.yml`.

```bash
npm run new -- --type writeup --category offsec --title "Amaterasu" --description "What this walkthrough demonstrates." --topics linux,networking --difficulty easy --os Linux --canvas
```

Supported difficulties are `easy`, `medium`, `hard`, and `insane`. `--os` and `--difficulty` are optional. To add a new platform:

```bash
npm run category -- --type platform --name "Vuln Labs" --id vuln-labs
```

### Article

```bash
npm run new -- --type article --title "Reading HTTP requests" --description "A practical guide to understanding request structure." --topics http,web-security
```

Run `npm run new` without options for the interactive prompts. The aliases `note`, `writeup`, and `article` are accepted.

## Frontmatter reference

The CLI fills in the title, description, slug, topics, and `draft: true`. A new draft typically starts like this:

```yaml
---
title: Example title
description: One-sentence summary for listings and search.
slug: example-title
topics:
  - web-security
draft: true
---
```

Optional fields include:

- `publishedAt`: publication date in `YYYY-MM-DD` format. The publish command sets it automatically.
- `updatedAt`: date the entry was last updated.
- `aliases`: old root-relative paths to redirect, each ending in `/`.
- `difficulty` and `os`: write-up metadata.
- `platform`: registered write-up platform ID, such as `offsec`.
- `sourceUrl`: source/reference URL when relevant.
- `order`: optional ordering value.

Published entries require a title, description, valid publication date, at least one registered topic, and a nonempty Markdown body. Slugs and IDs must be lowercase words separated with hyphens.

## Write the Markdown body

The supplied templates are starting outlines:

- Article: `templates/article.md`
- Note: `templates/note.md`
- Write-up: `templates/writeup.md`

Use standard Markdown and GitHub Flavored Markdown, including headings, lists, tables, links, and fenced code blocks. Keep notes focused; explain the evidence and reasoning in write-ups; structure longer topics as articles.

### Associate an Obsidian Canvas

Keep the entry's Markdown file for its title, topics, draft status, and prose. Place the exported `.canvas` file and any files used by its file nodes inside that entry's folder:

```text
content/writeups/amaterasu/
  index.md
  amaterasu.canvas
  image/
    nmap.png
```

Associate the board from `index.md` frontmatter:

```yaml
canvas: amaterasu.canvas
```

The entry page provides separate Markdown and Canvas tabs, so the board and write-up do not get duplicated in one long page. Canvas text, groups, links, edges, and local image/file nodes render in the Canvas tab. Put file-node attachments in `image/`; vault-root `images/` paths are mapped to that folder when possible. The legacy `![[board.canvas]]` syntax remains available when you intentionally want a board inline in the Markdown body.

### Link between entries

Use a public path for a page on this site:

```markdown
See the [HTTP request note](/notes/http-request-anatomy/).
```

You can also link to a nearby Markdown file using a relative path. The build resolves local Markdown links to the entry's public URL. `npm run check` catches missing local files and links from published entries to drafts.

### Add images and other files

The CLI creates an `image/` directory beside the entry's `index.md`. Put that entry's screenshots or diagrams there and link relatively:

```markdown
![Request and response flow](./image/request-flow.png)
```

Keep attachments inside the entry folder. Existing `images/` folders continue to work, while new entries use `image/`. Local PNG, JPG, JPEG, and WebP images are optimized during the build. Files in `public/` are copied to the site unchanged; for example, `public/images/avatar.png` is available at `/images/avatar.png`.

For files reused across entries, place them under `content/assets/`. Markdown links can use a relative path such as `../../../assets/memes/reaction.png` from a write-up under `content/writeups/offsec/name/`. In an Obsidian Canvas with `content/` as the vault root, use `assets/memes/reaction.png`. The content checker and build accept shared files only from `content/assets/`.

Keep attachments inside the entry folder. Existing `images/` folders continue to work, while new entries use `image/`. Local PNG, JPG, JPEG, and WebP images are optimized during the build. Files in `public/` are copied to the site unchanged; for example, `public/images/avatar.png` is available at `/images/avatar.png`.

## Preview, validate, and publish

Start the local preview:

```bash
npm run dev
```

Open the local URL Astro prints. Drafts are included in this preview so you can review them before publishing.

Check all content and references:

```bash
npm run check
```

When the entry is ready, publish it using its source path:

```bash
npm run publish:content -- content/notes/web-security/reconnaissance/virtual-host-discovery/index.md
```

This changes `draft` to `false` and sets `publishedAt` to today in the timezone configured in `config/site.yml`. For an already-published entry, it sets `updatedAt` instead. The command edits the file but does not commit or push it.

Before deployment, run:

```bash
npm run check
npm test
npm run build
```

The build validates content, creates the static site and search data, and checks the hosting output. The generated `dist/` folder is the deployable site; do not edit it by hand. If there are no published entries, Pagefind is skipped and the site still builds with empty states.

## Export a write-up for Medium

Publish the write-up on your site first so its images have public URLs, then generate a clean HTML copy from the same Markdown source:

```bash
npm run export:medium -- content/writeups/offsec/InsanityHosting/index.md
```

The exporter writes `exports/medium/insanityhosting.html`. Open it in a browser, copy the rendered article body, and paste it into a new Medium story. Set the Medium story title from the write-up frontmatter and, if desired, set its canonical URL to the original page. Canvas links and embeds are omitted; article images point to the versions already hosted by the site. Generated exports are ignored by Git.

## Configure the site

Edit `config/site.yml`:

- `name`: site identity shown in the sidebar and footer.
- `description`: small subtitle under the name in the sidebar.
- `tagline`: homepage subtitle and RSS description.
- `url`: canonical site origin, such as `https://gachuaa.github.io`.
- `base`: `/` for a user/organization site, or `/<repository>/` for a project site.
- `timezone`: used when the CLI assigns publication dates.
- `pageSize`: number of entries per paginated listing.
- `socials`: social profile URLs.
- `about`: text shown on the About page.

Edit `config/taxonomy.yml` to add shared topics or write-up platforms. Prefer the CLI so IDs, labels, and parent folders are generated consistently:

```bash
npm run category -- --type topic --name "API Security" --parent web-security
npm run category -- --type platform --name "TryHackMe" --id thm
```

A topic only appears in the public directory when published content uses it. A platform appears on the Write-ups page when it has published write-ups.

## Publish on GitHub Pages

The repository includes `.github/workflows/deploy.yml`. It runs on pushes to `main` and can also be started manually from the GitHub Actions tab. It uses Node 24, runs `npm ci`, validates content, builds the site, and deploys `dist/`.

### 1. Set the Pages URL and base

For a repository named `gachuaa.github.io`:

```yaml
url: https://gachuaa.github.io
base: /
```

For a project repository such as `wiki`:

```yaml
url: https://gachuaa.github.io
base: /wiki/
```

Use the repository name exactly in `base`, including the leading and trailing slash.

### 2. Push the project to GitHub

Create a repository on GitHub, then from the project folder initialize and push if this folder is not already a Git repository:

```bash
git init
git add .
git commit -m "Set up Gachuaa's Wiki"
git branch -M main
git remote add origin https://github.com/gachuaa/REPOSITORY.git
git push -u origin main
```

Replace `REPOSITORY` with the repository name. If Git is already initialized or a remote exists, do not repeat `git init` or `git remote add`; commit and push to the configured remote instead.

### 3. Enable GitHub Actions for Pages

In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The workflow needs the `pages: write` and `id-token: write` permissions already declared in its YAML.

### 4. Check deployment

Open the **Actions** tab and wait for **Deploy to GitHub Pages** to finish successfully. The deployed URL is shown in the workflow's `github-pages` environment. For a project repository, the URL includes `/<repository>/`.

For future updates, edit Markdown or configuration, run the checks above, then commit and push to `main`. GitHub Actions will rebuild and publish automatically.

## Troubleshooting

- **A draft is missing from the deployed site:** expected behavior. Run `npm run publish:content -- <path-to-index.md>` first.
- **`Unknown topic` during creation or validation:** add the topic with `npm run category -- --type topic ...` and use its ID in frontmatter.
- **Write-up platform is unknown:** register it with `npm run category -- --type platform ...`.
- **Broken local image/link:** check the relative path from the entry's `index.md`; attachments must remain inside that entry folder.
- **Site works at `/` but fails as a project site:** set `base` to `/<repository>/` in `config/site.yml`, then rebuild and push.
- **Deployment did not start:** confirm the branch is `main`, the workflow exists under `.github/workflows/`, and Pages source is set to GitHub Actions.
- **No search index build on an empty site:** this is expected; Pagefind only runs when there are published entries.
