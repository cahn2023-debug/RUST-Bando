/**
 * Unit tests for mapStartupTelemetry.ts
 *
 * Validates: Requirements 7.3, 7.6, 7.7
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getStartupReport,
  markMapStartup,
  recordRAFViolation,
  resetTelemetry,
  type StartupMilestone,
} from '../mapStartupTelemetry';

describe('mapStartupTelemetry', () => {
  beforeEach(() => {
    resetTelemetry();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Report Consistency — Property test (R7.7)
  // totalStartupTime === milestones['first-feature'] - milestones['map-created']
  // for multiple orderings of intermediate milestones
  // -------------------------------------------------------------------------
  describe('report consistency — totalStartupTime formula (R7.7)', () => {
    it('ordering 1: map-created then first-feature', async () => {
      markMapStartup('host-mounted');
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('map-created');
      await new Promise(r => setTimeout(r, 10));
      markMapStartup('first-feature');

      const report = getStartupReport();
      const expected = (report.milestones['first-feature'] ?? 0) - (report.milestones['map-created'] ?? 0);
      expect(report.totalStartupTime).toBe(expected);
      // first-feature elapsed > map-created elapsed → totalStartupTime > 0
      expect(report.totalStartupTime).toBeGreaterThanOrEqual(0);
    });

    it('ordering 2: intermediate milestones between map-created and first-feature', async () => {
      markMapStartup('host-mounted');
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('constructor-start');
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('map-created');
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('first-render');
      await new Promise(r => setTimeout(r, 10));
      markMapStartup('first-feature');

      const report = getStartupReport();
      const expected = (report.milestones['first-feature'] ?? 0) - (report.milestones['map-created'] ?? 0);
      expect(report.totalStartupTime).toBe(expected);
      expect(report.totalStartupTime).toBeGreaterThanOrEqual(0);
    });

    it('ordering 3: milestones recorded in arbitrary order still yield correct formula', async () => {
      markMapStartup('host-mounted');
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('first-feature');   // first-feature recorded before map-created
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('map-created');

      const report = getStartupReport();
      // The formula is always milestones['first-feature'] - milestones['map-created']
      expect(report.totalStartupTime).toBe(
        (report.milestones['first-feature'] ?? 0) - (report.milestones['map-created'] ?? 0)
      );
    });

    it('ordering 4: many milestones across the full startup sequence', async () => {
      const milestones: StartupMilestone[] = [
        'host-mounted',
        'container-sized',
        'constructor-start',
        'constructor-end',
        'map-created',
        'first-render',
        'first-source-data',
        'first-raster-tile',
        'interactive',
        'overlay-context-ready',
        'project-bind-start',
        'first-feature',
        'project-bind-complete',
      ];

      for (const m of milestones) {
        markMapStartup(m);
        await new Promise(r => setTimeout(r, 2));
      }

      const report = getStartupReport();
      expect(report.totalStartupTime).toBe(
        (report.milestones['first-feature'] ?? 0) - (report.milestones['map-created'] ?? 0)
      );
      expect(report.totalStartupTime).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // recordRAFViolation
  // -------------------------------------------------------------------------
  describe('recordRAFViolation', () => {
    it('single violation appears in report with exact durationMs and featureCount', () => {
      recordRAFViolation(25, 100);

      const report = getStartupReport();
      expect(report.rafViolations).toHaveLength(1);
      expect(report.rafViolations[0].durationMs).toBe(25);
      expect(report.rafViolations[0].featureCount).toBe(100);
    });

    it('violation entry includes a numeric timestamp', () => {
      recordRAFViolation(25, 100);

      const report = getStartupReport();
      expect(report.rafViolations[0].timestamp).toBeTypeOf('number');
    });
  });

  // -------------------------------------------------------------------------
  // Immutability of rafViolations array
  // -------------------------------------------------------------------------
  describe('immutability of rafViolations', () => {
    it('mutating the returned array does not affect internal state', () => {
      recordRAFViolation(25, 100);

      const first = getStartupReport();
      // Push a fake entry into the returned copy
      first.rafViolations.push({ durationMs: 999, featureCount: 999, timestamp: 0 });

      const second = getStartupReport();
      expect(second.rafViolations).toHaveLength(1);
      expect(second.rafViolations[0].durationMs).toBe(25);
      expect(second.rafViolations[0].featureCount).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // resetTelemetry
  // -------------------------------------------------------------------------
  describe('resetTelemetry', () => {
    it('returns empty report after reset', () => {
      markMapStartup('map-created');
      markMapStartup('first-feature');
      recordRAFViolation(20, 5);

      resetTelemetry();

      const report = getStartupReport();
      expect(report.milestones).toEqual({});
      expect(report.totalStartupTime).toBe(0);
      expect(report.rafViolations).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // totalStartupTime when milestones are missing
  // Formula: firstFeature - mapCreated, where missing milestones default to 0
  // -------------------------------------------------------------------------
  describe('totalStartupTime with missing milestones', () => {
    it('is negative or zero mapCreated when only map-created is marked (first-feature defaults to 0)', async () => {
      markMapStartup('host-mounted');
      await new Promise(r => setTimeout(r, 5));
      markMapStartup('map-created');

      const report = getStartupReport();
      const mapCreated = report.milestones['map-created'] ?? 0;
      const firstFeature = report.milestones['first-feature'] ?? 0;

      // first-feature is missing → defaults to 0
      expect(firstFeature).toBe(0);
      expect(report.totalStartupTime).toBe(firstFeature - mapCreated);
    });

    it('is 0 when neither map-created nor first-feature is marked (both default to 0)', () => {
      markMapStartup('host-mounted');

      const report = getStartupReport();
      expect(report.totalStartupTime).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple violations — order preserved
  // -------------------------------------------------------------------------
  describe('multiple violations', () => {
    it('records 3 violations in insertion order', () => {
      recordRAFViolation(17, 10);
      recordRAFViolation(25, 50);
      recordRAFViolation(40, 200);

      const report = getStartupReport();
      expect(report.rafViolations).toHaveLength(3);

      expect(report.rafViolations[0]).toMatchObject({ durationMs: 17, featureCount: 10 });
      expect(report.rafViolations[1]).toMatchObject({ durationMs: 25, featureCount: 50 });
      expect(report.rafViolations[2]).toMatchObject({ durationMs: 40, featureCount: 200 });
    });
  });
});
