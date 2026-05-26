import * as dotenv from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { NotificationType, PostStatus, PrismaClient } from '@prisma/client';

// Load .env from project root (process.cwd() = c:\Mquid_backend when run via npm run seed)
dotenv.config({ path: path.join(process.cwd(), '.env'), override: true });

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  await prisma.$connect();
  console.log('Connected to database');

  // ----------------------------------------------------------------
  // 1. Upsert super_admin user
  // ----------------------------------------------------------------
  const hashed = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mymquid.com' },
    update: {},
    create: {
      name: 'Patrick Evra',
      email: 'admin@mymquid.com',
      password: hashed,
      role: 'super_admin',
    },
  });
  console.log('Admin user ready: Patrick Evra <admin@mymquid.com>');

  // ----------------------------------------------------------------
  // 2. Seed blog posts (skip if slug already exists)
  // ----------------------------------------------------------------
  const TIPTAP_PLACEHOLDER =
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Placeholder content — replace this with real Tiptap JSON."}]}]}';

  const postSeedData: Array<{
    title: string;
    slug: string;
    content: string;
    status: PostStatus;
    category: string;
    tags: string[];
    metaTitle: string;
    metaDescription: string;
    scheduledAt?: Date;
  }> = [
    {
      title: 'Welcome to MyMquid Elevate',
      slug: 'welcome-to-mymquid-elevate',
      content: TIPTAP_PLACEHOLDER,
      status: PostStatus.published,
      category: 'Company News',
      tags: ['welcome', 'platform'],
      metaTitle: 'Welcome to MyMquid Elevate',
      metaDescription: 'Get started with the MyMquid Elevate admin platform.',
    },
    {
      title: 'How to Maximise Your Performance',
      slug: 'how-to-maximise-your-performance',
      content: TIPTAP_PLACEHOLDER,
      status: PostStatus.published,
      category: 'Insights',
      tags: ['performance', 'tips'],
      metaTitle: 'How to Maximise Your Performance',
      metaDescription: 'Practical tips to elevate your performance with MyMquid.',
    },
    {
      title: 'Case Study: Acme Corp Transformation',
      slug: 'case-study-acme-corp-transformation',
      content: TIPTAP_PLACEHOLDER,
      status: PostStatus.draft,
      category: 'Case Studies',
      tags: ['case-study', 'enterprise'],
      metaTitle: 'Case Study: Acme Corp Transformation',
      metaDescription: 'How Acme Corp transformed with MyMquid Elevate.',
    },
    {
      title: 'Upcoming Platform Updates',
      slug: 'upcoming-platform-updates',
      content: TIPTAP_PLACEHOLDER,
      status: PostStatus.scheduled,
      category: 'Company News',
      tags: ['updates', 'roadmap'],
      metaTitle: 'Upcoming Platform Updates',
      metaDescription: 'A preview of upcoming features and improvements.',
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const postData of postSeedData) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: postData.slug } });
    if (!existing) {
      await prisma.blogPost.create({
        data: {
          ...postData,
          authorId: admin.id,
        },
      });
      console.log(`Created post: ${postData.title}`);
    } else {
      console.log(`Post already exists — skipping: ${postData.title}`);
    }
  }

  // ----------------------------------------------------------------
  // 3. Seed notifications linked to admin user
  // ----------------------------------------------------------------
  const notifSeedData: Array<{ title: string; message: string; type: NotificationType }> = [
    {
      title: 'Platform ready',
      message: 'MyMquid Elevate backend is up and running.',
      type: NotificationType.success,
    },
    {
      title: 'New post published',
      message: 'Welcome post has been published successfully.',
      type: NotificationType.info,
    },
    {
      title: 'Seed complete',
      message: 'Database seeded with sample data.',
      type: NotificationType.info,
    },
  ];

  for (const notifData of notifSeedData) {
    await prisma.notification.create({
      data: {
        ...notifData,
        userId: admin.id,
      },
    });
  }
  console.log('Created 3 notifications for admin user');

  // ----------------------------------------------------------------
  // Done
  // ----------------------------------------------------------------
  await prisma.$disconnect();
  console.log('Seed complete! You can now log in with admin@mymquid.com / Admin1234!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
