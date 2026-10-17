/**
 * QA Phase 5 — open ownership defects found by the route-handler coverage map (docs/qa/route-coverage-map.md).
 * Production code is NOT changed here (owner approval pending). Each defect is pinned twice:
 *
 *   - `test.failing` = the decided requirement. It fails today, so Jest reports it as passing. When the
 *     route is fixed it starts to pass, Jest reports it as failing, and the pin must become a plain test.
 *   - a characterization test asserting today's behavior, so the pin cannot "pass" for an unrelated reason
 *     (a broken mock would fail the characterization too).
 *
 * DC-33  POST /api/plagiarism/flag: any teacher can adjudicate any course's flag (Q-07, Q-10).
 * DC-34  POST /api/assignments/create: any teacher can configure AI grading for any assignment (Q-07).
 * DC-11 the same route rejects GURU, which Q-02 makes identical to TEACHER.
 * DC-30  POST /api/plagiarism/flag: a 500 still returns error.message (A7 was not applied here).
 */
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { PERSONAS, sessionFor, userRecordFor, type PersonaName } from '../helpers/personas';
import { buildRequest } from '../helpers/request';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';
import * as flagRoute from '@/app/api/plagiarism/flag/route';
import * as aiCreateRoute from '@/app/api/assignments/create/route';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});
jest.mock('@/lib/ai', () => ({ resolveProviderName: jest.fn(() => 'local') }));
jest.mock('@/lib/db2/pds-repo', () => ({
  pdsTables: jest.fn(() => ({})),
  updateFlag: jest.fn(),
  insertTeacherAction: jest.fn(),
  insertAuditLog: jest.fn(),
}));
jest.mock('@/lib/db2/acs-repo', () => ({
  getAcsAssignmentByAssignmentId: jest.fn(),
  getUploadedFilesByResourceIds: jest.fn(),
  insertUploadedFiles: jest.fn(),
  upsertAcsAssignment: jest.fn(),
}));
jest.mock('@/lib/ai-local/acs-local-repo', () => ({
  getAcsLocalAssignmentByAssignmentId: jest.fn(async () => null),
  upsertAcsLocalAssignment: jest.fn(),
}));
jest.mock('@/lib/ai-local/rag/ingest', () => ({ createLocalCorpus: jest.fn() }));
jest.mock('@/lib/openai', () => ({ getOpenAI: jest.fn() }));

const db = prisma as unknown as PrismaMock;
const pds = jest.requireMock('@/lib/db2/pds-repo') as Record<string, jest.Mock>;
const localAcs = jest.requireMock('@/lib/ai-local/acs-local-repo') as Record<string, jest.Mock>;

function signIn(persona: PersonaName) {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
  db.app_user.findUnique.mockResolvedValue(userRecordFor(PERSONAS[persona]));
}

beforeEach(() => {
  resetPrismaMock(db);
  for (const level of ['log', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => {});
  pds.updateFlag.mockResolvedValue({ id: 'flag-1', reviewed: true });
  pds.insertTeacherAction.mockResolvedValue(undefined);
  pds.insertAuditLog.mockResolvedValue(undefined);
  // The flag belongs to class_course 70 (teacher 201). Nothing in the route reads this today.
  db.resources.findMany.mockResolvedValue([]);
});

// ------------------------------------------------------------------ DC-33

const flagBody = { flag_id: 'flag-1', action: 'marked_false_positive', notes: 'n', is_false_positive: true };
const postFlag = () => flagRoute.POST(buildRequest('/api/plagiarism/flag', { method: 'POST', json: flagBody }));

describe('DC-33 / Q-07, Q-10: POST /api/plagiarism/flag ownership', () => {
  test('the owning teacher may adjudicate (positive path)', async () => {
    signIn('teacherOwner');
    expect((await postFlag()).status).toBe(200);
    expect(pds.updateFlag).toHaveBeenCalledWith('flag-1', expect.objectContaining({ reviewed_by: '201' }), {});
  });

  test.each(['student', 'otherStudent'] as const)('%s => 403, flag untouched', async persona => {
    signIn(persona);
    expect((await postFlag()).status).toBe(403);
    expect(pds.updateFlag).not.toHaveBeenCalled();
  });

  test('anonymous => 401', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await postFlag()).status).toBe(401);
  });

  test.failing('[DC-33 requirement] a teacher of another class => 403, flag untouched', async () => {
    signIn('teacherOther');
    expect((await postFlag()).status).toBe(403);
    expect(pds.updateFlag).not.toHaveBeenCalled();
  });

  test('[DC-33 characterization] today a teacher of another class adjudicates the flag (200, written)', async () => {
    signIn('teacherOther');
    expect((await postFlag()).status).toBe(200);
    expect(pds.updateFlag).toHaveBeenCalledWith('flag-1', expect.objectContaining({ reviewed_by: '202' }), {});
  });

  test.failing('[DC-30 requirement] a storage failure => 500 without internal details', async () => {
    signIn('teacherOwner');
    pds.updateFlag.mockRejectedValue(new Error('relation "pds_flags" does not exist'));
    const res = await postFlag();
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty('details');
  });

  test('[DC-30 characterization] today the 500 body carries the database error text', async () => {
    signIn('teacherOwner');
    pds.updateFlag.mockRejectedValue(new Error('relation "pds_flags" does not exist'));
    const res = await postFlag();
    expect(res.status).toBe(500);
    expect((await res.json()).details).toBe('relation "pds_flags" does not exist');
  });
});

// ------------------------------------------------------------------ DC-34 / DC-11

const aiBody = { assignmentId: 7001, courseId: 50, rubric: { criteria: [] }, resourceIds: [9001] };
const postAiSetup = () =>
  aiCreateRoute.POST(buildRequest('/api/assignments/create', { method: 'POST', json: aiBody }));

describe('DC-34 / DC-11: POST /api/assignments/create (AI grading setup)', () => {
  test.each(['student', 'otherStudent'] as const)('%s => 403 before any lookup', async persona => {
    signIn(persona);
    expect((await postAiSetup()).status).toBe(403);
    expect(db.resources.findMany).not.toHaveBeenCalled();
  });

  test('anonymous => 401', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await postAiSetup()).status).toBe(401);
  });

  test.failing('[DC-34 requirement] a teacher of another class => 403 before resources are read', async () => {
    signIn('teacherOther');
    expect((await postAiSetup()).status).toBe(403);
    expect(db.resources.findMany).not.toHaveBeenCalled();
  });

  test('[DC-34 characterization] today a teacher of another class passes auth and reaches the resource lookup', async () => {
    signIn('teacherOther');
    const res = await postAiSetup();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('No valid resources found for the given IDs');
    // Resource ids are not scoped to the course either: the lookup is by id only.
    expect(db.resources.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [9001] } } }));
    expect(localAcs.getAcsLocalAssignmentByAssignmentId).toHaveBeenCalledWith('7001');
  });

  test.failing('[DC-11 requirement, Q-02] the owning teacher with role GURU is not rejected', async () => {
    signIn('guruOwner');
    expect((await postAiSetup()).status).not.toBe(403);
  });

  test('[DC-11 characterization] today GURU gets 403', async () => {
    signIn('guruOwner');
    expect((await postAiSetup()).status).toBe(403);
  });
});
