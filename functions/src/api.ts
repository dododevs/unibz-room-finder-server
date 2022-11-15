import axios from 'axios';
import dayjs from 'dayjs'
import ical, { CalendarComponent } from 'ical';

const AWS_URL: string = "https://aws.unibz.it/risweb/timetable.aspx";

export type TimeSlot = {
    start: Date|null,
    end: Date|null,
    description: string|null
};

export type Room = {
    campus: string,
    building: string,
    name: string
};

export type RoomAvailability = {
    room: Room,
    reservedSlots: TimeSlot[],
    freeSlots: TimeSlot[]
};

const compareReservedSlots = (slot1: TimeSlot, slot2: TimeSlot): number => {
    if (slot1.start === null || slot2.start === null) {
        return 0;
    }
    return slot1.start.getTime() - slot2.start.getTime();
}

const normalizeValidRoomName = (room: string): Room|null => {
    const m: RegExpExecArray|null = /(?<campus>BZ|BX)*\s*(?<building>[A-Z])*\s*(?<room>[0-9]\.*[0-9]+)/.exec(room);
    return m && m.groups ? {
        campus: m.groups.campus || "BZ",
        building: m.groups.building || "",
        name: m.groups.room
    } : null;
};

const computeFreeSlots = (room: RoomAvailability): TimeSlot[] => {
    return room.reservedSlots.flatMap((slot: TimeSlot, j: number, arr: TimeSlot[]): TimeSlot[] => {
        let slots: TimeSlot[] = [];
        if (j < 1) {
            const sstart = dayjs(slot.start);
            const startOfDay = sstart.startOf('day');
            if (sstart.diff(startOfDay, 'hours') >= 1) {
                slots = [ { start: null, end: sstart.toDate(), description: null } ];
            }
        } else {
            const sstart = dayjs(slot.start);
            const eend = dayjs(arr[j - 1].end);
            if (sstart.diff(eend, 'hours') >= 1) {
                slots = [...slots, { start: eend.toDate(), end: sstart.toDate(), description: null }];
            }
        }
        if (j === arr.length - 1) {
            const eend = dayjs(slot.end);
            const endOfDay = eend.endOf('day');
            if (endOfDay.diff(eend, 'hours') >= 1) {
                slots = [ ...slots, { start: eend.toDate(), end: null, description: null } ];
            }
        }
        return slots;
    });
};

const getRoomsAndAvailability = (calendar: object): RoomAvailability[] => {
    return Object.values(calendar).flatMap((event: CalendarComponent, i: number, arr: object[]): RoomAvailability[] => {
        const room = normalizeValidRoomName(event.location || "");
        if (room && event.start && event.end) {
            return [{ room: room, reservedSlots: [ { start: event.start, end: event.end, description: event.summary || null } ], freeSlots: [] }];
        }
        return [];
    }).sort((a, b) => {
        return `${a.room.campus} ${a.room.building} ${a.room.name}`.localeCompare(`${b.room.campus} ${b.room.building} ${b.room.name}`);
    }).reduce((distinct: RoomAvailability[], avail: RoomAvailability, i: number, arr): RoomAvailability[] => {
        if (i < 1) return [ arr[0] ];
        let li = distinct.length - 1;
        if (avail.room.name === distinct[li].room.name && 
                avail.room.campus === distinct[li].room.campus && 
                    avail.room.building === distinct[li].room.building) {
            distinct[li].reservedSlots = [...distinct[li].reservedSlots, ...avail.reservedSlots];
            distinct[li].reservedSlots = distinct[li].reservedSlots.sort(compareReservedSlots);
            return distinct;
        }
        return [...distinct, arr[i]];
    }, []).map((room: RoomAvailability): RoomAvailability => ({ ...room, freeSlots: computeFreeSlots(room) }));
};

export const getRoomAvailability = async function() {
    const today: string = dayjs().format('DD.MM.YYYY');
    return new Promise((resolve, reject) => {
        axios.get(`${AWS_URL}?showtype=0&format=icalDow&start=${today}&end=${today}`).then(res => {
            const calendar = ical.parseICS(res.data);
            const availabilities = getRoomsAndAvailability(calendar as object);
            resolve(availabilities);
        }).catch(error => reject(error));
    });
};