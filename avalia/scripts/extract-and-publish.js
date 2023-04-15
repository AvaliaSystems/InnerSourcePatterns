const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

function slugify(str) {
  str = str.replace(/^\s+|\s+$/g, ''); // trim
  str = str.toLowerCase();

  // remove diacritical marks
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  str = str
    .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
    .replace(/\s+/g, '-') // collapse whitespace and replace by -
    .replace(/-+/g, '-'); // collapse dashes

  return str;
}

function extractMarkdownData(markdown) {
  const sectionRegex = /^##\s(.*?)\n(.*?)(?=##|$(?![^]))/gms;

  const data = {
    markdown,
  };

  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(markdown)) !== null) {
    data[sectionMatch[1].toLowerCase().trim().replace(/\s+/g, '_')] = sectionMatch[2].trim();
  }

  data.title = data.title || 'untitled';

  return data;
}

async function processFile(file) {
  const filePath = path.resolve(file);
  const relativePath = path.relative('../', file);
  const markdownWithRelativeLinks = await fs.readFile(filePath, 'utf-8');

  const baseUrl = `https://github.com/InnerSourceCommons/InnerSourcePatterns/blob/main/${relativePath.replace(/^\.\.\//, '')}`;
  const regexPattern = /\]\(([^ )]+)(?: "([^"]*)")?\)/g;
  const markdown = markdownWithRelativeLinks.replace(regexPattern, (match, relativeUrl, title) => {
    const absoluteUrl = new URL(relativeUrl, baseUrl);
    if (title) {
      return `](${absoluteUrl} "${title}")`;
    }
    return `](${absoluteUrl})`;
  });

  const data = extractMarkdownData(markdown);
  data.title = data.title || relativePath;
  data.slug = filePath.match(/\/([^\/]+)\.[^.]+$/)?.[1] ?? '';
  return {
    url: baseUrl,
    stage: relativePath.match(/\/(\d+-\w+)\//)?.[1] ?? '',
    ...data,
  };
}

async function extract() {
  const searchPath = '../../patterns/**/*.md';
  const outputFile = 'patterns.json';

  const files = await glob(searchPath);
  const patterns = [];
  for (const file of files) {
    if (file.indexOf('/templates/') === -1) {
      const result = await processFile(file);
      patterns.push(result);
    }
  }

  await fs.writeFile(outputFile, JSON.stringify(patterns, null, 2));
  console.log(`Patterns written to: ${outputFile}`);
  return patterns;
}

const publish = async (patterns) => {
  for (const pattern of patterns) {
    const payload = {
      uid: pattern.slug,
      title: pattern.title,
      summary: pattern.patlet,
      catalog: 'InnerSource Patterns',
      properties: {
        ...pattern,
      },
    };

    const PUBLISH_URL = `${process.env.DXHUB_KB_API_URL}/api/patterns`;
    const response = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.DXHUB_KB_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    console.log(`POSTed ${pattern.slug}, status: ${response.status}`);
  }
};

const main = async () => {
  const patterns = await extract();
  await publish(patterns);
};

main()
  .then(() => console.log('Done.'))
  .catch((e) => console.log(e));
