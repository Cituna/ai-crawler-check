# AI Crawler Check

A free browser extension from [Cituna](https://cituna.com) that answers one question about the page you are on: **can the AI engines read it?**

Click the icon and it reads the site's `robots.txt` the way the crawlers do, then shows, for this exact path:

- **AI search crawlers**: `OAI-SearchBot` (ChatGPT search), `Claude-SearchBot`, `PerplexityBot`. Blocking these keeps the page out of that engine's search answers.
- **Fetches a person asked for**: `ChatGPT-User`, `Claude-User`.
- **Google and Bing search**: `Googlebot` (Google Search, AI Overviews and AI Mode) and `Bingbot`.
- **Model training opt-outs**: `GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`, `CCBot`, `meta-externalagent`, `Amazonbot`, `Bytespider`, `anthropic-ai`. These are shown as "Opted out", not as a problem: opting out of training does not hide a page from AI search.
- **Page signals**: meta robots and `X-Robots-Tag` (noindex, nosnippet), the canonical URL, every JSON-LD `@type` on the page, and whether `/llms.txt` exists.

Hover a crawler to see the exact rule that decided it.

## How robots.txt is read

The parser follows [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309) and [Google's open-source parser](https://github.com/google/robotstxt), the same rules Cituna's paid audit uses:

- A crawler obeys every group naming its product token, merged; only if none does, every `*` group.
- `*` matches any run of characters, `$` anchors only at the end, and otherwise a rule is a prefix match.
- The longest matching rule wins, and `Allow` wins a tie. An empty `Disallow:` matches nothing.
- No `robots.txt` (a 4xx) means everything is allowed. A 5xx means Google treats the whole site as blocked until it answers again.

`Perplexity-User` is left out on purpose: Perplexity says it generally ignores `robots.txt`, so a reading for it would describe a gate that does not exist.

## Privacy

The extension collects nothing and sends nothing to Cituna or anyone else. When you click the icon it asks the site you are on for `/robots.txt`, `/llms.txt` and the page's own headers, reads the page's meta tags and JSON-LD, and shows the result in the popup. No analytics, no accounts, no storage. It uses only the `activeTab` and `scripting` permissions, so it can read a page only after you click the icon on it. See [PRIVACY.md](PRIVACY.md).

The button at the bottom opens cituna.com in a new tab, where you can run a free scan of what ChatGPT, Perplexity, Gemini, Claude, Grok, Google AI Overviews and Google AI Mode say about the site.

## Install

- [Chrome Web Store](https://chromewebstore.google.com/detail/ai-crawler-check-by-citun/fidcbodloagcjgolpgkgifdlbmjgiold)
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ai-crawler-check-by-cituna/appjdegpafkmepiiphdokmcdedailghf)

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder.

## License

MIT. Made by [Cituna](https://cituna.com), the AI visibility platform.
