# Changelog

## NEXT

- BREAKING CHANGE: Require Node.js >= 18
- Update deps

## 0.4.0

- Fix typing issue; all generic `TMessage` args now inherit from MongoDB's `Document` interface
- Simplify build
- Update deps

## 0.3.0

- Add type-safety to all event emitters
- Add `Consumer.drain` method (waits until consumer could not receive a message)
- Add `MessageQueue` class that combines existing capabilities for convenience
- Update deps

## 0.2.1

- Fix bug in `Consumer` where past messages were sometimes not correctly consumed
- Update dependencies
- Add tests

## 0.2.0

- Initial version
