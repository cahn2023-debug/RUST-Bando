use design_core::design_events::fetch_project_state_data;
use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\Du_an_165.pmp";
    let project_id = "d9d7986b-c630-4e9d-a9ff-ed5309164c0f";

    println!("Testing fetch_project_state_data for path: {}", path);
    println!("Project ID: {}", project_id);

    let conn = Connection::open(path)?;

    match fetch_project_state_data(&conn, project_id, None) {
        Ok(state) => {
            println!("Successfully fetched state data!");
            println!("Snapshot exists: {}", state.snapshot.is_some());
            println!("Number of events: {}", state.events.len());

            if !state.events.is_empty() {
                println!(
                    "First event: ID={}, Payload={}",
                    state.events[0].0, state.events[0].1
                );
            }
        }
        Err(e) => {
            println!("Error fetching state data: {}", e);
        }
    }

    Ok(())
}
