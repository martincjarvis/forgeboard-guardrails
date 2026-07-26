import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import { parse as parseYaml } from "yaml";

export interface DocHeading {
  depth: number;
  text: string;
  slug: string;
}

export interface DocLink {
  /** Everything before `#`. Empty string for a same-file fragment link. */
  target: string;
  /** The `#fragment`, without the hash. `undefined` when there is none. */
  fragment?: string;
  line: number;
  /** Character offsets of the whole `[label](target)` node in the source. */
  start: number;
  end: number;
}

export interface DocCodeSpan {
  value: string;
  line: number;
}

export interface DocModel {
  frontmatter?: Record<string, unknown>;
  headings: DocHeading[];
  links: DocLink[];
  codeSpans: DocCodeSpan[];
}

const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);

/**
 * Parses one markdown document into the shape the docs gates consume.
 *
 * Uses remark rather than regex because link syntax inside a fenced code block is
 * not a link, and fence nesting (a three-backtick block inside a four-backtick one)
 * defeats line-based fence tracking. The AST never sees those as link nodes.
 */
export function parseMarkdown(source: string): DocModel {
  const tree = processor.parse(source);
  const slugger = new GithubSlugger();

  const headings: DocHeading[] = [];
  const links: DocLink[] = [];
  const codeSpans: DocCodeSpan[] = [];
  let frontmatter: Record<string, unknown> | undefined;

  visit(tree, (node) => {
    switch (node.type) {
      case "yaml": {
        const parsed = parseYaml(String(node.value));
        if (parsed && typeof parsed === "object") {
          frontmatter = parsed as Record<string, unknown>;
        }
        break;
      }
      case "heading": {
        const text = toString(node);
        headings.push({ depth: node.depth, text, slug: slugger.slug(text) });
        break;
      }
      case "link": {
        const url = String(node.url);
        const hash = url.indexOf("#");
        links.push({
          target: hash === -1 ? url : url.slice(0, hash),
          fragment: hash === -1 ? undefined : url.slice(hash + 1),
          line: node.position?.start.line ?? 0,
          start: node.position?.start.offset ?? 0,
          end: node.position?.end.offset ?? 0,
        });
        break;
      }
      case "inlineCode": {
        codeSpans.push({
          value: String(node.value),
          line: node.position?.start.line ?? 0,
        });
        break;
      }
    }
  });

  return { frontmatter, headings, links, codeSpans };
}
