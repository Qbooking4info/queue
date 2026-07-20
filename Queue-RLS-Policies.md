# Queue — Row Level Security Policies
**Updated:** July 2026 · All tables have RLS enabled · Service-role (admin) always bypasses RLS

Web API routes use `createAdminClient()` (service role key) and are **not affected by these policies**. Policies protect direct anon-key access — primarily from the mobile app and any unauthenticated requests.

---

## `users`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own profile | SELECT | `auth_id = auth.uid()` |
| Users can insert own profile | INSERT | `auth_id = auth.uid()` |
| Users can update own profile | UPDATE | `auth_id = auth.uid()` |

---

## `dependents`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own dependents | SELECT | `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Users can insert own dependents | INSERT | same |
| Users can update own dependents | UPDATE | same |
| Users can delete own dependents | DELETE | same |

---

## `user_insurance`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own insurance | SELECT | `user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Users can insert own insurance | INSERT | same |
| Users can update own insurance | UPDATE | same |
| Users can delete own insurance | DELETE | same |

---

## `hospitals`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active hospitals | SELECT | `true` (all rows readable) |

---

## `specialties`
| Policy | Operation | Rule |
|---|---|---|
| Public can read specialties | SELECT | `true` |

---

## `hospital_specialties`
| Policy | Operation | Rule |
|---|---|---|
| Public can read hospital specialties | SELECT | `true` |

---

## `doctors`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active doctors | SELECT | `true` |

---

## `services`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active services | SELECT | `true` |

---

## `hospital_operating_hours`
| Policy | Operation | Rule |
|---|---|---|
| Public can read operating hours | SELECT | `true` |

---

## `doctor_specialties`
| Policy | Operation | Rule |
|---|---|---|
| Public can read doctor specialties | SELECT | `true` |

---

## `time_slots`
| Policy | Operation | Rule |
|---|---|---|
| Public can read available slots | SELECT | `is_available = true` |
| Hospital admins manage slots | ALL | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |
| Patients can update own booked slot count | UPDATE | `is_available = true AND id IN (SELECT slot_id FROM appointments WHERE patient_id = ... AND status = 'pending')` |

> The slot UPDATE policy was tightened (migration `20260601020000`) so patients can only increment `booked_count` on a slot they hold a pending appointment for.

---

## `appointments`
| Policy | Operation | Rule |
|---|---|---|
| Patients can create their own appointments | INSERT | `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Patients can view their own appointments | SELECT | `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Hospital admins manage their appointments | ALL | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

**DB Triggers on this table (not RLS but enforced at DB level):**
- `appointment_status_guard` — BEFORE UPDATE; blocks status changes FROM `completed`, `cancelled`, `no_show`
- `enforce_plan_booking_limit` — BEFORE INSERT; rejects insert if hospital's active plan `max_monthly_bookings` is reached

---

## `vitals_audit_log`
| Policy | Operation | Rule |
|---|---|---|
| *(none yet)* | — | RLS enabled; service role writes only. No SELECT policies defined. |

---

## `reviews`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own reviews | SELECT | `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Patients can create reviews | INSERT | patient must own the appointment AND appointment status must be `completed` |
| Hospital admins can read their hospital reviews | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |
| Hospital admins can reply to reviews | UPDATE | hospital admin of that hospital; WITH CHECK locks all fields except `hospital_reply` and `replied_at` |

> One-review-per-appointment enforced by UNIQUE constraint `reviews_appointment_id_patient_id_key`.

---

## `notifications`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own notifications | SELECT | `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Users can mark own notifications read | UPDATE | same |

---

## `appointment_documents`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own appointment documents | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE patient_id = ...)` |
| Hospital staff can upload appointment documents | INSERT | `appointment_id IN (SELECT id FROM appointments WHERE hospital_id IN (...hospital_admins...))` |
| Hospital staff can update appointment documents | UPDATE | same |
| Hospital staff can delete appointment documents | DELETE | same |

---

## `hospital_admins`
| Policy | Operation | Rule |
|---|---|---|
| Hospital members can read own hospital admins | SELECT | caller's `hospital_id` matches any of their own admin records |
| Users can read own admin record | SELECT | `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |

---

## `hospital_subscriptions`
| Policy | Operation | Rule |
|---|---|---|
| Hospital admins can read own subscription | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

---

## `payments`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own payments | SELECT | `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Hospital admins can read hospital payments | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

---

## `payouts`
| Policy | Operation | Rule |
|---|---|---|
| Hospital admins can read own payouts | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

---

## `virtual_sessions`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own virtual sessions | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE patient_id = ...)` |
| Hospital staff can read hospital virtual sessions | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE hospital_id IN (...hospital_admins...))` |

---

## `emr_integrations`
| Policy | Operation | Rule |
|---|---|---|
| Hospital admins can read own EMR integration | SELECT | hospital admin with role `admin` or `owner` only |

---

## `subscription_plans`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active subscription plans | SELECT | `is_active = true` |

---

## `availability_templates`
| Policy | Operation | Rule |
|---|---|---|
| Public can read availability templates | SELECT | `true` |
| Hospital admins manage availability templates | ALL | `doctor_id IN (SELECT id FROM doctors WHERE hospital_id IN (...hospital_admins...))` |

---

## `slot_overrides`
| Policy | Operation | Rule |
|---|---|---|
| Public can read slot overrides | SELECT | `true` |
| Hospital admins manage slot overrides | ALL | `doctor_id IN (SELECT id FROM doctors WHERE hospital_id IN (...hospital_admins...))` |

---

## `hospital_images`
| Policy | Operation | Rule |
|---|---|---|
| Public can read hospital images | SELECT | `true` |
| Hospital admins manage hospital images | ALL | hospital admin with role `admin` or `owner` only |

---

## Performance Indexes (added alongside RLS)

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `idx_hospital_admins_user_hospital` | `hospital_admins` | `(user_id, hospital_id)` | Every admin RLS subquery |
| `idx_hospital_admins_hospital` | `hospital_admins` | `(hospital_id)` | Hospital-scoped lookups |
| `idx_hospitals_lat_lng` | `hospitals` | `(latitude, longitude)` WHERE both NOT NULL | Bounding-box spatial queries |
| `vitals_audit_log_appointment_idx` | `vitals_audit_log` | `(appointment_id, recorded_at DESC)` | Vitals history lookups |
