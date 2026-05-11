import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable, jobApplicationsTable, usersTable } from "@workspace/db";
import { eq, ilike, or, sql, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  ApplyToJobParams,
  ApplyToJobBody,
} from "@workspace/api-zod";
import { ensureUser, buildUserProfile } from "./users";

const router = Router();

async function buildJob(job: any, viewerClerkId?: string) {
  const poster = await db.query.usersTable.findFirst({ where: eq(usersTable.id, job.posterId) });
  const posterProfile = poster ? await buildUserProfile(poster, viewerClerkId) : null;
  const [applicants] = await db.select({ count: sql<number>`count(*)` }).from(jobApplicationsTable).where(eq(jobApplicationsTable.jobId, job.id));
  return {
    ...job,
    skills: Array.isArray(job.skills) ? job.skills : [],
    poster: posterProfile,
    applicantsCount: Number(applicants?.count ?? 0),
    aiMatchScore: null,
  };
}

router.get("/jobs", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const query = ListJobsQueryParams.safeParse(req.query);
  const q = query.success ? query.data.q : undefined;
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const offset = query.success ? (query.data.offset ?? 0) : 0;

  let jobs;
  if (q) {
    jobs = await db.select().from(jobsTable).where(or(ilike(jobsTable.title, `%${q}%`), ilike(jobsTable.company, `%${q}%`))).orderBy(desc(jobsTable.createdAt)).limit(limit).offset(offset);
  } else {
    jobs = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt)).limit(limit).offset(offset);
  }
  const enriched = await Promise.all(jobs.map(j => buildJob(j, clerkId ?? undefined)));
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(jobsTable);
  res.json({ jobs: enriched, total: Number(total?.count ?? 0), hasMore: jobs.length === limit });
});

router.post("/jobs", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const { title, company, location, type, description, skills, salaryMin, salaryMax } = parsed.data;
  const [job] = await db.insert(jobsTable).values({ posterId: user.id, title, company, location, type, description, skills: skills ?? [], salaryMin: salaryMin ?? null, salaryMax: salaryMax ?? null }).returning();
  const enriched = await buildJob(job, clerkId);
  res.status(201).json(enriched);
});

router.get("/jobs/ai-match", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const jobs = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt)).limit(10);
  const enriched = await Promise.all(jobs.map(async j => {
    const built = await buildJob(j, clerkId ?? undefined);
    return { ...built, aiMatchScore: Math.round(Math.random() * 40 + 60) / 100 };
  }));
  res.json({ jobs: enriched, total: enriched.length, hasMore: false });
});

router.get("/jobs/:jobId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { jobId } = GetJobParams.parse(req.params);
  const job = await db.query.jobsTable.findFirst({ where: eq(jobsTable.id, Number(jobId)) });
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await buildJob(job, clerkId ?? undefined);
  res.json(enriched);
});

router.post("/jobs/:jobId/apply", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { jobId } = ApplyToJobParams.parse(req.params);
  const parsed = ApplyToJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const [application] = await db.insert(jobApplicationsTable).values({ jobId: Number(jobId), userId: user.id, coverLetter: parsed.data.coverLetter, status: "pending" }).returning();
  res.status(201).json(application);
});

export default router;
