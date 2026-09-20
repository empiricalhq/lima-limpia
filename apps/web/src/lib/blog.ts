import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';

export interface PostMetadata {
  title: string;
  date: string;
  author: string;
  category: string;
  summary?: string;
  thumbnail?: string;
  thumbnailAlt?: string;
}

export interface Post {
  slug: string;
  metadata: PostMetadata;
  content: string;
}

const POSTS_DIRECTORY = path.join(process.cwd(), 'src/posts');
const FRONTMATTER_REGEX = /---\s*([\s\S]*?)\s*---/;
const QUOTED_VALUE_REGEX = /^['"](.*)['"]$/;

function parseFrontmatter(fileContent: string) {
  const match = FRONTMATTER_REGEX.exec(fileContent);

  if (!match) {
    return { metadata: {} as PostMetadata, content: fileContent };
  }

  const [, frontMatterBlock] = match;
  const content = fileContent.replace(FRONTMATTER_REGEX, '').trim();
  const frontMatterLines = frontMatterBlock.trim().split('\n');
  const metadata: Partial<PostMetadata> = {};

  for (const line of frontMatterLines) {
    const [key, ...valueArr] = line.split(': ');
    let value = valueArr.join(': ').trim();
    value = value.replace(QUOTED_VALUE_REGEX, '$1');

    if (key && value) {
      const typedKey = key.trim() as keyof PostMetadata;
      metadata[typedKey] = value;
    }
  }

  return { metadata: metadata as PostMetadata, content };
}

function getMDXFiles(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter((file) => path.extname(file) === '.mdx');
}

function readMDXFile(filePath: string) {
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(rawContent);
}

export const getBlogPosts = cache((): Post[] => {
  const mdxFiles = getMDXFiles(POSTS_DIRECTORY);

  const posts = mdxFiles.map((file) => {
    const { metadata, content } = readMDXFile(path.join(POSTS_DIRECTORY, file));
    const slug = path.basename(file, path.extname(file));

    return {
      metadata,
      slug,
      content,
    };
  });

  return posts.sort((a, b) => {
    if (new Date(a.metadata.date) > new Date(b.metadata.date)) {
      return -1;
    }
    return 1;
  });
});

export function getPostBySlug(slug: string): Post | undefined {
  const posts = getBlogPosts();
  return posts.find((post) => post.slug === slug);
}

export function generateExcerpt(content: string, length = 160): string {
  const cleanContent = content
    .replace(/#+\s/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\n/g, ' ');

  if (cleanContent.length <= length) {
    return cleanContent;
  }
  return `${cleanContent.slice(0, length).trimEnd()}...`;
}
