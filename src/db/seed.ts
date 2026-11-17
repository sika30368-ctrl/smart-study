import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  academicYears,
  grades,
  lessons,
  ministryAssessments,
  ministryMonitorLogs,
  subjects,
  units,
} from './schema.ts';
import {
  MOE_PORTALS,
  SEED_ACADEMIC_YEARS,
  SEED_ASSESSMENTS,
  SEED_CURRICULUM,
  SEED_GRADES,
} from './seed-data.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runIdempotentSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

export async function runIdempotentSeed(): Promise<void> {
  try {
    // 1. Academic years
    for (const yr of SEED_ACADEMIC_YEARS) {
      await db
        .insert(academicYears)
        .values(yr)
        .onConflictDoNothing({ target: academicYears.code });
    }

    // 2. Grades (Prep 1-3 & Sec 1-3)
    for (const g of SEED_GRADES) {
      await db
        .insert(grades)
        .values(g)
        .onConflictDoNothing({ target: grades.code });
    }

    // 3. Subjects, Units & Lessons (idempotent by subject.code)
    for (const subj of SEED_CURRICULUM) {
      const existingSubj = await db
        .select()
        .from(subjects)
        .where(eq(subjects.code, subj.code))
        .limit(1);

      let subjectId: number;
      if (existingSubj.length > 0) {
        subjectId = existingSubj[0].id;
      } else {
        const insertedSubj = await db
          .insert(subjects)
          .values({
            code: subj.code,
            gradeCode: subj.gradeCode,
            nameAr: subj.nameAr,
            nameEn: subj.nameEn,
            track: subj.track,
            languageTrack: subj.languageTrack,
            academicYear: '2025-2026',
            descriptionAr: subj.descriptionAr,
            descriptionEn: subj.descriptionEn,
            officialBookUrlAr: subj.officialBookUrlAr,
            officialBookUrlEn: subj.officialBookUrlEn,
            iconKey: subj.iconKey,
          })
          .returning();
        subjectId = insertedSubj[0].id;

        for (const u of subj.units) {
          const insertedUnit = await db
            .insert(units)
            .values({
              subjectId,
              semester: u.semester,
              orderIndex: u.orderIndex,
              titleAr: u.titleAr,
              titleEn: u.titleEn,
              descriptionAr: u.descriptionAr,
              descriptionEn: u.descriptionEn,
            })
            .returning();

          const unitId = insertedUnit[0].id;
          for (const l of u.lessons) {
            await db.insert(lessons).values({
              unitId,
              chapterAr: l.chapterAr,
              chapterEn: l.chapterEn,
              orderIndex: l.orderIndex,
              titleAr: l.titleAr,
              titleEn: l.titleEn,
              contentAr: l.contentAr,
              contentEn: l.contentEn,
              isOfficialEn: l.isOfficialEn,
              learningObjectivesAr: l.learningObjectivesAr,
              learningObjectivesEn: l.learningObjectivesEn,
              keyDefinitionsAr: l.keyDefinitionsAr,
              keyDefinitionsEn: l.keyDefinitionsEn,
              formulasRules: l.formulasRules,
              exercisesAr: l.exercisesAr,
              exercisesEn: l.exercisesEn,
              revisionNotesAr: l.revisionNotesAr,
              revisionNotesEn: l.revisionNotesEn,
              officialSourceUrl: l.officialSourceUrl,
              sourceVerified: true,
              publishedDate: l.publishedDate,
              versionNumber: 1,
            });
          }
        }
      }
    }

    // 4. Official Ministry Assessments (seed if empty)
    const existingAssessments = await db
      .select({ id: ministryAssessments.id })
      .from(ministryAssessments)
      .limit(1);
    if (existingAssessments.length === 0) {
      for (const a of SEED_ASSESSMENTS) {
        await db.insert(ministryAssessments).values(a);
      }
    }

    // 5. Initial MOE monitor log entry if empty
    const existingLogs = await db
      .select({ id: ministryMonitorLogs.id })
      .from(ministryMonitorLogs)
      .limit(1);
    if (existingLogs.length === 0) {
      await db.insert(ministryMonitorLogs).values({
        targetUrl: MOE_PORTALS.assessments,
        status: 'success',
        discoveredCount: 3,
        discoveredResourcesJson: [
          {
            title: 'بوابة الكتب الدراسية الإلكترونية — وزارة التربية والتعليم',
            url: MOE_PORTALS.studentBooks,
            type: 'portal',
            discoveredVia: 'verified_official_directory',
          },
          {
            title: 'بوابة الأداءات والتقييمات الأسبوعية والشهرية',
            url: MOE_PORTALS.assessments,
            type: 'assessments_portal',
            discoveredVia: 'verified_official_directory',
          },
          {
            title: 'بوابة التعليم الإلكتروني الرسمية',
            url: MOE_PORTALS.elearning,
            type: 'elearning_portal',
            discoveredVia: 'verified_official_directory',
          },
        ],
        notes: 'Initial official Egyptian Ministry of Education portal directory verified.',
      });
    }
  } catch (error) {
    console.error('Database seed failed:', error);
    throw new Error('Failed to initialize curriculum catalog.', { cause: error });
  }
}
