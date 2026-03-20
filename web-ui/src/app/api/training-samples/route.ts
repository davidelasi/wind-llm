import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const file = searchParams.get('file');
  const dir = path.join(process.cwd(), 'data/training/few_shot_examples');

  if (!file) {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.includes(' '))
      .sort();
    return NextResponse.json({ files });
  }

  const filename = file.endsWith('.json') ? file : `${file}.json`;
  if (!/^[a-z0-9_-]+\.json$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  try {
    const content = readFileSync(path.join(dir, filename), 'utf-8');
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
