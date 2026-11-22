// Queue Doctor — desktop shell.
//
// The window hosts the same Expo web build the browser would run, so there is
// no second implementation of any screen to keep in step. Rust's job here is
// the window, the installer and the system webview; everything the clinician
// sees is the app that already exists.
//
// Deliberately no custom commands: anything the desktop build can do, the web
// build can already do through Supabase and the API. A Rust command would be a
// capability only this build has, and a screen that behaves differently
// depending on how it was packaged is a bug waiting to be reported.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Queue Doctor");
}
