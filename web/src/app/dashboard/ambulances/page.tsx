import { redirect } from 'next/navigation'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { AutoRefreshAmbulances } from './AutoRefreshAmbulances'
import { AmbulancesList } from './AmbulancesList'
import { loadHospitalTransports } from '@/lib/hospital-transports'

export const dynamic = 'force-dynamic'

export default async function AmbulancesPage() {
  const { db, adminRecord } = await getHospitalContext()

  if (!['admin', 'owner', 'front_desk'].includes(adminRecord.role ?? '')) redirect('/dashboard')

  const { requests } = await loadHospitalTransports(db, adminRecord.hospital_id)

  return (
    <>
      <AutoRefreshAmbulances hospitalId={adminRecord.hospital_id} />
      <AmbulancesList
        requests={requests}
        hospitalId={adminRecord.hospital_id}
        canManageFleet={adminRecord.role === 'admin' || adminRecord.role === 'owner'}
      />
    </>
  )
}
