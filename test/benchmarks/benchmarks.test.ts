import { describe, it } from 'node:test';
import { Benchmark, BenchmarkOptions } from './Benchmark';

describe('Benchmarks', () => {
  const url = 'mongodb://localhost:27017';
  const benchmarks: BenchmarkOptions[] = process.env.BENCHMARK
    ? [
        {
          messageSize: 1,
          concurrency: 1,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
        {
          messageSize: 1,
          concurrency: 4,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
        {
          messageSize: 1,
          concurrency: 8,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
        {
          messageSize: 1000,
          concurrency: 1,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
        {
          messageSize: 1000,
          concurrency: 4,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
        {
          messageSize: 1000 * 1000,
          concurrency: 4,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
        {
          messageSize: 1,
          concurrency: 1,
          numMessages: 0,
          publishDelayMs: 0,
          numPastMessages: 1000,
          url,
        },
        {
          messageSize: 1,
          concurrency: 4,
          numMessages: 0,
          publishDelayMs: 0,
          numPastMessages: 1000,
          url,
        },
        {
          messageSize: 1,
          concurrency: 8,
          numMessages: 0,
          publishDelayMs: 0,
          numPastMessages: 1000,
          url,
        },
        {
          messageSize: 1000,
          concurrency: 4,
          numMessages: 0,
          publishDelayMs: 0,
          numPastMessages: 100000,
          url,
        },
      ]
    : [
        {
          messageSize: 1000,
          concurrency: 4,
          numMessages: 1000,
          publishDelayMs: 0,
          numPastMessages: 0,
          url,
        },
      ];

  for (const options of benchmarks) {
    it('...', async () => {
      const benchmark = new Benchmark(options);

      await benchmark.setup();
      await benchmark.run();

      // eslint-disable-next-line no-console
      console.log(options, benchmark.report());
    });
  }
});
