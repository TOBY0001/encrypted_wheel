use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    #[instruction]
    pub fn spin(user: Shared, num_segments: u8) -> Enc<Shared, u8> {
        // Generate a secure, private random number from 1 to num_segments for wheel outcomes
        let random = ArcisRNG::gen_integer_from_width(3) as u8;  // 0-7 fair random
        let result = (random % num_segments) + 1;  // Convert to 1-based indexing
        user.from_arcis(result)
    }
}