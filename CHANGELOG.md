# Changelog

## NEXT

- Update dependencies

## 1.2.3

- Update dependencies

## 1.2.2

- Migrate tests to `node:test`
- Update dependencies

## 1.2.1

- Update dependencies

## 1.2.0

- Allow passing session and other options to `Publisher.publish`
- Update dependencies

## 1.1.0

- Add `group` to consumer event callback signature
- Add `deadLetter` event to handle permanently failed messages

## 1.0.0

- BREAKING CHANGES
  - Require Node.js >= 18
  - Consumer and subscriber callbacks must return `void`
- Fix compatibility issues with `mongodb@4`, `mongodb@5`, `mongodb@6` (all supported)
- Fix issue where `BatchPublisher` would not publish a message until next `publish` call
- Add `fastPollMs` option to consumers
- Remove casting to `Error`
- Add preliminary benchmarks
- Update dependencies

## 0.4.0

- Fix typing issue; all generic `TMessage` args now inherit from MongoDB's `Document` interface
- Simplify build
- Update dependencies

## 0.3.0

- Add type-safety to all event emitters
- Add `Consumer.drain` method (waits until consumer could not receive a message)
- Add `MessageQueue` class that combines existing capabilities for convenience
- Update dependencies

## 0.2.1

- Fix bug in `Consumer` where past messages were sometimes not correctly consumed
- Update dependencies
- Add tests

## 0.2.0

- Initial version
