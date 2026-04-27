//! Helper utilities for safe concurrent access
//! Provides ergonomic wrappers to replace .lock().unwrap() patterns

use crate::error::AppError;
use parking_lot::Mutex;
use std::sync::Arc;

/// Trait for ergonomic mutex locking with proper error handling
pub trait LockExt<T> {
    /// Lock the mutex and return a guard, with error handling
    fn lock_safe(&self) -> Result<parking_lot::MutexGuard<'_, T>, AppError>;
}

impl<T> LockExt<T> for Arc<Mutex<T>> {
    fn lock_safe(&self) -> Result<parking_lot::MutexGuard<'_, T>, AppError> {
        Ok(self.lock())
    }
}

/// Trait for Option<Mutex<T>> patterns (common in DatabaseState)
pub trait OptionLockExt<T> {
    /// Lock and get the Option, caller must check if Some
    fn lock_and_get(&self) -> parking_lot::MutexGuard<'_, Option<T>>;
}

impl<T> OptionLockExt<T> for Arc<Mutex<Option<T>>> {
    fn lock_and_get(&self) -> parking_lot::MutexGuard<'_, Option<T>> {
        self.lock()
    }
}

/// Trait for Option<Mutex<T>> with mutable access
pub trait OptionLockMutExt<T> {
    /// Lock mutably and get the Option
    fn lock_mut_and_get(&self) -> parking_lot::MutexGuard<'_, Option<T>>;
}

impl<T> OptionLockMutExt<T> for Arc<Mutex<Option<T>>> {
    fn lock_mut_and_get(&self) -> parking_lot::MutexGuard<'_, Option<T>> {
        self.lock()
    }
}

/// Helper function for the common pattern: lock, check option, operate
pub fn with_option<T, R, F>(
    opt_mutex: &Arc<Mutex<Option<T>>>,
    context: &str,
    f: F,
) -> Result<R, AppError>
where
    F: FnOnce(&T) -> Result<R, AppError>,
{
    let guard = opt_mutex.lock();
    let value = guard.as_ref().ok_or_else(|| AppError::Unknown(context.to_string()))?;
    f(value)
}

/// Helper function for mutable access pattern
pub fn with_option_mut<T, R, F>(
    opt_mutex: &Arc<Mutex<Option<T>>>,
    context: &str,
    f: F,
) -> Result<R, AppError>
where
    F: FnOnce(&mut T) -> Result<R, AppError>,
{
    let mut guard = opt_mutex.lock();
    let value = guard.as_mut().ok_or_else(|| AppError::Unknown(context.to_string()))?;
    f(value)
}

/// Helper for std::sync::Mutex<Option<T>> with proper error conversion
pub mod std_mutex {
    use crate::error::AppError;
    use std::sync::Mutex;
    use std::sync::Arc;

    /// Lock a std::sync::Mutex safely
    pub fn lock_std<T>(mtx: &Arc<Mutex<T>>) -> Result<std::sync::MutexGuard<'_, T>, AppError> {
        mtx.lock()
            .map_err(|_| AppError::LockPoisoned("Mutex poisoned"))
    }

    /// Lock and get Option, caller checks if Some
    pub fn lock_and_get_option<T>(
        mtx: &Arc<Mutex<Option<T>>>,
    ) -> Result<std::sync::MutexGuard<'_, Option<T>>, AppError> {
        mtx.lock()
            .map_err(|_| AppError::LockPoisoned("Mutex poisoned"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lock_ext() {
        let mtx = Arc::new(Mutex::new(42));
        let guard = mtx.lock_safe().unwrap();
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_option_lock_and_check_some() {
        let mtx: Arc<Mutex<Option<i32>>> = Arc::new(Mutex::new(Some(42)));
        let guard = mtx.lock_and_get();
        assert_eq!(*guard, Some(42));
    }

    #[test]
    fn test_option_lock_and_check_none() {
        let mtx: Arc<Mutex<Option<i32>>> = Arc::new(Mutex::new(None));
        let guard = mtx.lock_and_get();
        assert_eq!(*guard, None);
    }
}
