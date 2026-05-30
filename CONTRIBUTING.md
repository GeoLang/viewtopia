# Contributing to Viewtopia

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:YOUR_USERNAME/viewtopia.git`
3. Create a branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Run checks: `cargo fmt --all && cargo clippy --all-targets --all-features -- -D warnings && cargo test --all`
6. Commit and push
7. Open a Pull Request

## Code Standards

- **Formatting**: Run `cargo fmt --all` before committing
- **Linting**: `cargo clippy --all-targets --all-features -- -D warnings` must pass cleanly
- **Testing**: All new functionality must include tests
- **Documentation**: Public APIs must have doc comments
- **Dependencies**: Run `cargo deny check` to verify license compliance

## Pull Request Process

1. Update the CHANGELOG.md with your changes under `[Unreleased]`
2. Ensure CI passes on all platforms (Ubuntu, Windows, macOS)
3. Request review from a maintainer
4. Squash commits before merge if requested

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Include your Rust version (`rustc --version`)

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0-or-later.
