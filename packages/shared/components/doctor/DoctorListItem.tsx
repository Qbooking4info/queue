import { EntityAvatar } from '../ui/EntityAvatar'
import { Row, Mono } from '../q'
import type { IndependentDoctor } from '../../lib/api'

interface Props { doctor: IndependentDoctor; onPress: () => void }

/**
 * One doctor, as a row inside a card. The handoff's doctor list carries a
 * name, what they do and where, and the fee -- the badges for "Virtual" and
 * "Home visit" collapse into that same line, because a row gets one pill and
 * the fee is the thing a patient is actually comparing.
 */
export function DoctorListItem({ doctor: d, onPress }: Props) {
  const modes = [
    d.acceptsDirectVirtual ? 'sees patients online' : null,
    d.acceptsDirectHomeVisit ? 'home visits' : null,
  ].filter(Boolean)

  const sub = [
    d.specialty?.name ?? 'General practice',
    d.level,
    modes.length ? modes.join(' · ') : (d.hospitals.length ? d.hospitals.map(h => h.name).join(', ') : null),
  ].filter(Boolean).join(' · ')

  // The lowest fee this doctor can be booked at directly. A doctor with no
  // direct booking has no fee of their own -- they are booked through a
  // hospital, at the hospital's price -- so nothing is printed.
  const fees = [
    d.acceptsDirectVirtual ? d.virtualFee : null,
    d.acceptsDirectHomeVisit ? d.homeVisitFee : null,
  ].filter((n): n is number => n != null)
  const fee = fees.length ? Math.min(...fees) : null

  return (
    <Row
      leading={<EntityAvatar size={40} kind="doctor" uri={d.avatarUrl} gender={d.gender} label={d.fullName} />}
      title={`${d.title ? d.title + ' ' : ''}${d.fullName}`}
      sub={sub}
      right={fee != null ? <Mono size={13} weight="700">₦{fee.toLocaleString('en-NG')}</Mono> : undefined}
      chevron
      onPress={onPress}
    />
  )
}
