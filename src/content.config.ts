import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
const dateField=z.preprocess((value)=>value instanceof Date?value.toISOString().slice(0,10):value,z.string().optional());
const schema=z.object({
  title:z.string(),description:z.string().default(''),slug:z.string().optional(),
  canvas:z.string().optional(),canvasUrl:z.string().optional(),
  draft:z.boolean().default(true),publishedAt:dateField,updatedAt:dateField,
  topics:z.array(z.string()).default([]),type:z.enum(['notes','writeups','articles']),
  folders:z.array(z.string()).default([]),folderLabels:z.array(z.string()).default([]),sourceUrl:z.string().optional(),
  sourcePath:z.string(),platform:z.string().default(''),minutes:z.number().default(1),
  difficulty:z.string().optional(),os:z.string().optional(),order:z.number().optional(),aliases:z.array(z.string()).default([])
});
export const collections=Object.fromEntries(['notes','writeups','articles'].map(type=>[type,defineCollection({loader:glob({base:`./.generated/content/${type}`,pattern:'**/*.md'}),schema})]));
