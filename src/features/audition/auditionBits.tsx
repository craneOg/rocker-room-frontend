import { useQuery } from '@tanstack/react-query'
import { formatKstDay, formatKstTime } from '../../shared/lib/time'
import { performanceKey } from '../performance/api'
import {
  listAuditableSongs,
  listAuditionSchedules,
  type Audition,
  type AuditionType,
} from './auditionApi'
import { AUDITION_COPY as T } from './auditionCopy'

export const typeLabel = (t: AuditionType) =>
  t === 'SONG' ? T.typeSong : T.typeSession

/** "11.05(목) 19:00", or the "no schedule" text. */
export const whenText = (iso: string | null) =>
  iso ? `${formatKstDay(iso)} ${formatKstTime(iso)}` : T.noSchedule

/** Card target (AUDI-001 3): a song audition is "곡 전체" (+ scope team), a session one the applicant and part. */
export const targetText = (a: Audition) =>
  a.type === 'SONG'
    ? [T.wholeSong, a.candidateTeamName].filter(Boolean).join(' · ')
    : [a.applicantName, a.partName].filter(Boolean).join(' · ')

/** Candidate and confirmed songs of the performance (A-03), for the filter and the form. */
export const useSongOptions = (clubId: string, performanceId: string) =>
  useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'audition-songs'],
    queryFn: () => listAuditableSongs(clubId, performanceId),
  })

/** The performance's audition schedules (A-05). */
export const useScheduleOptions = (clubId: string, performanceId: string) =>
  useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'audition-schedules'],
    queryFn: () => listAuditionSchedules(clubId, performanceId),
  })
