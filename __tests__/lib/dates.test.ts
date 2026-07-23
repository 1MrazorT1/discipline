import { startOfDay, addDays, dayBounds, formatDayTitle, formatTime } from '@/lib/dates';

describe('dates', () => {
  describe('startOfDay', () => {
    it('should zero out hours, minutes, seconds, and milliseconds', () => {
      const date = new Date('2024-03-15T14:30:45.123');
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('should preserve the date portion', () => {
      const date = new Date('2024-03-15T14:30:45.123');
      const result = startOfDay(date);
      expect(result.getDate()).toBe(15);
      expect(result.getMonth()).toBe(2); // March (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should not mutate the original date', () => {
      const date = new Date('2024-03-15T14:30:45.123');
      const original = new Date(date);
      startOfDay(date);
      expect(date).toEqual(original);
    });

    it('should handle midnight correctly', () => {
      const date = new Date('2024-03-15T00:00:00.000');
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
    });

    it('should handle end of day correctly', () => {
      const date = new Date('2024-03-15T23:59:59.999');
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
    });
  });

  describe('addDays', () => {
    it('should add positive days correctly', () => {
      const date = new Date('2024-03-15T10:00:00.000');
      const result = addDays(date, 3);
      expect(result.getDate()).toBe(18);
      expect(result.getMonth()).toBe(2);
      expect(result.getFullYear()).toBe(2024);
    });

    it('should add negative days correctly', () => {
      const date = new Date('2024-03-15T10:00:00.000');
      const result = addDays(date, -3);
      expect(result.getDate()).toBe(12);
      expect(result.getMonth()).toBe(2);
      expect(result.getFullYear()).toBe(2024);
    });

    it('should add zero days and return same date', () => {
      const date = new Date('2024-03-15T10:00:00.000');
      const result = addDays(date, 0);
      expect(result.getTime()).toBe(date.getTime());
    });

    it('should not mutate the original date', () => {
      const date = new Date('2024-03-15T10:00:00.000');
      const original = new Date(date);
      addDays(date, 5);
      expect(date).toEqual(original);
    });

    it('should handle month boundary crossing', () => {
      const date = new Date('2024-03-31T10:00:00.000');
      const result = addDays(date, 1);
      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(3); // April
    });

    it('should handle year boundary crossing', () => {
      const date = new Date('2024-12-31T10:00:00.000');
      const result = addDays(date, 1);
      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getFullYear()).toBe(2025);
    });

    it('should handle leap year', () => {
      const date = new Date('2024-02-28T10:00:00.000');
      const result = addDays(date, 1);
      expect(result.getDate()).toBe(29);
      expect(result.getMonth()).toBe(1); // February
    });
  });

  describe('dayBounds', () => {
    it('should return start and end ISO strings for a given day', () => {
      const date = new Date('2024-03-15T14:30:45.123');
      const { start, end } = dayBounds(date);
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getHours()).toBe(0);
      expect(endDate.getMinutes()).toBe(0);
    });

    it('should return end as exactly 24 hours after start', () => {
      const date = new Date('2024-03-15T14:30:45.123');
      const { start, end } = dayBounds(date);
      
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const diff = endTime - startTime;
      
      expect(diff).toBe(24 * 60 * 60 * 1000); // 24 hours in milliseconds
    });

    it('should handle midnight correctly', () => {
      const date = new Date('2024-03-15T00:00:00.000');
      const { start, end } = dayBounds(date);
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      expect(startDate.getDate()).toBe(15);
      expect(startDate.getMonth()).toBe(2);
      expect(endDate.getDate()).toBe(16);
      expect(endDate.getMonth()).toBe(2);
    });

    it('should handle end of day correctly', () => {
      const date = new Date('2024-03-15T23:59:59.999');
      const { start, end } = dayBounds(date);
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      expect(startDate.getDate()).toBe(15);
      expect(startDate.getMonth()).toBe(2);
      expect(endDate.getDate()).toBe(16);
      expect(endDate.getMonth()).toBe(2);
    });
  });

  describe('formatDayTitle', () => {
    it('should format date with weekday, month, and day', () => {
      const date = new Date('2024-03-15T10:00:00.000'); // Friday
      const result = formatDayTitle(date);
      expect(result).toContain('Friday');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
    });

    it('should handle different locales', () => {
      const date = new Date('2024-03-15T10:00:00.000');
      const result = formatDayTitle(date);
      // Should contain some form of weekday and date
      expect(result.length).toBeGreaterThan(5);
    });
  });

  describe('formatTime', () => {
    it('should format time with hour and minute', () => {
      const iso = new Date('2024-03-15T14:30:00.000').toISOString();
      const result = formatTime(iso);
      expect(result).toContain('2'); // hour
      expect(result).toContain('30'); // minute
    });

    it('should handle midnight', () => {
      const iso = new Date('2024-03-15T00:00:00.000').toISOString();
      const result = formatTime(iso);
      expect(result).toBeTruthy();
    });

    it('should handle noon', () => {
      const iso = new Date('2024-03-15T12:00:00.000').toISOString();
      const result = formatTime(iso);
      expect(result).toBeTruthy();
    });
  });
});
