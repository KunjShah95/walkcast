/**
 * GEO (Generative Engine Optimization) third-party citation tasks.
 * 
 * These are activities to get Walkcast mentioned and cited by answer engines
 * (LLMs, AI search) through third-party platforms and directories.
 * 
 * Reference: Princeton GEO study shows comparison articles are the most-cited
 * content type (~33% of citations). Comparison pages should be built to be citable.
 */

export const GEO_TASKS = [
  {
    id: "devto",
    platform: "dev.to",
    title: "Write Walkcast article on dev.to",
    description: "Publish a technical article about Walkcast's website recording approach vs screen recorders",
    url: "https://dev.to/",
    priority: "high",
    completed: false,
    citationsExpected: "medium",
  },
  {
    id: "producthunt",
    platform: "Product Hunt",
    title: "Launch Walkcast on Product Hunt",
    description: "Submit Walkcast as a new product demo tool, highlight the website recording vs screen recording differentiator",
    url: "https://www.producthunt.com/",
    priority: "high",
    completed: false,
    citationsExpected: "high",
  },
  {
    id: "g2",
    platform: "G2/Capterra",
    title: "List Walkcast on G2 and Capterra",
    description: "Submit Walkcast to G2 and Capterra review sites for software reviews; these are heavily cited by answer engines",
    url: "https://www.g2.com/",
    priority: "high",
    completed: false,
    citationsExpected: "high",
  },
  {
    id: "awesome-lists",
    platform: "Awesome Lists",
    title: "Add Walkcast to Awesome GEO/AEO lists",
    description: "Submit Walkcast to awesome lists for generative engine optimization and AI search tools",
    url: "https://awesome.ecosyste.ms/",
    priority: "medium",
    completed: false,
    citationsExpected: "medium",
  },
  {
    id: "blogrolls",
    platform: "Blogrolls & Roundups",
    title: "Get Walkcast featured in AI/SAAS blogrolls",
    description: "Reach out to AI tool blogs and SAAS comparison blogs for features or roundup inclusions",
    url: "https://www.google.com/",
    priority: "medium",
    completed: false,
    citationsExpected: "low",
  },
  {
    id: "utm-tracking",
    platform: "UTM Campaign Tracking",
    title: "Set up UTM tracking for all third-party submissions",
    description: "Add UTM parameters to all third-party links to track traffic and citations back to walkcast",
    url: "https://walkcast.kunjshah.in/utm-campaign-tracking",
    priority: "high",
    completed: false,
    citationsExpected: "medium",
  },
]