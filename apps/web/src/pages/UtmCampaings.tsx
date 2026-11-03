# UTM Campaign Tracking — Walkcast

*How to track which channels, platforms, and campaigns drive traffic to Walkcast using UTM parameters.*

---

## What are UTM parameters?

UTM parameters are five URL suffixes you append to any link you share. They tell Google and other analytics platforms exactly which **campaign** a click came from.

```
https://walkcast.kunjshah.in/download?utm_source=newsletter&utm_medium=email&utm_campaign=2026-10-hackathon
```

| Parameter | What it answers | Example |
|---|---|---|
| `utm_source` | Where the traffic comes from | `twitter`, `newsletter`, `product-hunt` |
| `utm_medium` | The marketing channel | `social`, `email`, `referral`, `cpc` |
| `utm_campaign` | The specific campaign or group | `hackathon-launch`, `blog-post` |
| `utm_term` | The paid search keyword | `walkcast alternative` |
| `utm_content` | A/B test variant or landing page | `button-text`, `video-demo` |

---

## Why track with UTMs on Walkcast?

The 5 queries below are the highest-value AI SEO targets. By adding UTM parameters to the links you share for these queries, you can measure:

- Which platform (Twitter, LinkedIn, Product Hunt, GitHub, HN) sends the most traffic
- Which campaign format (tweet vs. newsletter vs. blog post) converts
- Which query clusters drive actual users (not just AI citations)

---

## Quick UTM generator

Use this table to build your campaign links. Replace the `{clickable}` parts with your actual link.

### Campaign 1 — Product Demo Video queries

**Primary link** (plain):
```
https://walkcast.kunjshah.in/guides/product-demo-video
```

**Twitter campaign**:
```
https://walkcast.kunjshah.in/guides/product-demo-video?utm_source=twitter&utm_medium=social&utm_campaign=product-demo-video-guide
```

**Newsletter campaign**:
```
https://walkcast.kunjshah.in/guides/product-demo-video?utm_source=newsletter&utm_medium=email&utm_campaign=hackathon-2026
```

### Campaign 2 — Website Tutorial Video queries

**Primary link** (plain):
```
https://walkcast.kunjshah.in/guides/website-tutorial-video
```

**Twitter campaign**:
```
https://walkcast.kunjshah.in/guides/website-tutorial-video?utm_source=twitter&utm_medium=social&utm_campaign=website-tutorial-video-guide
```

**LinkedIn campaign**:
```
https://walkcast.kunjshah.in/guides/website-tutorial-video?utm_source=linkedin&utm_medium=social&utm_campaign=website-tutorial-video-overview
```

### Campaign 3 — Loom alternative query

**Primary link** (plain):
```
https://walkcast.kunjshah.in/compare/loom
```

**Twitter/LinkedIn campaign**:
```
https://walkcast.kunjshah.in/compare/loom?utm_source=twitter&utm_medium=social&utm_campaign=loom-alternative-comparison
```

### Campaign 4 — Browser agent testing query

**Primary link** (plain):
```
https://walkcast.kunjshah.in/lab
```

**LinkedIn/newsletter campaign**:
```
https://walkcast.kunjshah.in/lab?utm_source=newsletter&utm_medium=email&utm_campaign=browser-agent-testing-lab
```

### Campaign 5 — Pricing/freeness query

**Primary link** (plain):
```
https://walkcast.kunjshah.in/pricing
```

**Twitter/X campaign**:
```
https://walkcast.kunjshah.in/pricing?utm_source=x&utm_medium=social&utm_campaign=is-walkcast-free
```

---

## How to use these links

1. **Download page** — Add UTM parameters when sharing the installer link anywhere. Example:
   ```
   https://walkcast.kunjshah.in/download?utm_source=hackathon&utm_medium=poster&utm_campaign=2026-10
   ```

2. **GitHub** — Add UTM parameters to any link in your README or discussions:
   ```
   https://github.com/KunjShah95/walkcast?utm_source=github&utm_medium=readme&utm_campaign=main-repo
   ```

3. **Podcasts** — Append UTM parameters to show where podcast listeners came from.

4. **Blogs and guest posts** — Add UTMs to your outbound links so you know which guest posts drive traffic.

5. **Press** — Add UTM parameters to inbound links from journalists so you can report which stories drive traffic.

---

## Reading the results

Once you share these links, view the results in:

- **Google Analytics 4** (`analytics.google.com`) — *Reports → Acquisition → Campaigns → All Traffic*
- **Vercel Analytics** (`vercel.com/{your-project}`) — *Analytics → Pages* (if enabled)
- **Search Console** — *Performance → Queries* (shows traffic per source)

Look for these metrics:

| Metric | What it tells you |
|---|---|
| `sessions` | Total visits from this campaign |
| `engaged sessions` | Sessions that went beyond the first page |
| `conversion rate` | Clicks → downloads or installs (if tracked) |
| `bounce rate` | Do users leave after one page? |

**Priority metrics to track:**

1. `sessions` for each of the 5 query campaigns
2. `engaged sessions` — does the content actually hold attention?
3. `conversion rate` — downloads / installs
4. `average engagement time` — a proxy for content quality

---

## UTM best practices

- **Name campaigns consistently** — use the same `utm_campaign` value across all channels for one campaign.
- **Update `utm_source` per platform** — `twitter`, `x`, `linkedin`, `newsletter`, `product-hunt` are different sources.
- **Use `utm_content` for A/B tests** — `text-link` vs `branded-button`.
- **Avoid `utm_content` for standard links** — it creates sparse data.
- **Don't use UTMs on organic links** — UTMs only add noise to organic search data.
- **Keep UTMs in mind for content updates** — when you update a campaign, update the links everywhere.

---

## Related pages

- [Main site](https://walkcast.kunjshah.in/) — the app and all guides
- [Pricing in plain text](/pricing.md) — the price, in a format an agent can parse
- [llms.txt](https://walkcast.kunjshah.in/llms.txt) — a short, quotable summary linking each page

---

*Built for Walkcast. MIT licensed.*
