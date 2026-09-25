export type SiteConfig = {
  name: string
  author: string
  maintainer: string
  description: string
  keywords: Array<string>
  url: {
    base: string
    author: string
    maintainer: string
  }
  links: {
    github: string
  }
  ogImage: string
}
