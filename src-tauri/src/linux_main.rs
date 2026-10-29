// This entry point compiles only for the isolated Linux edition.
#[path = "main.rs"]
mod app;

fn main() {
    app::run_linux();
}
