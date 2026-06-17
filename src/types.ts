export interface Tappa {
  id: number;
  number: string;
  title: string;
  titleEn: string;
  lat: number;
  lng: number;
  description: string;
  descriptionEn: string;
  locationDetails: string;
  locationDetailsEn: string;
  details: string[];
  detailsEn: string[];
  era: "Romana" | "Medievale" | "Moderna" | "Mista";
  iconName: string;
}

export interface UserPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  simulated: boolean;
}

export interface GuidedTourInfo {
  type: string;
  typeEn: string;
  schedule: string[];
  scheduleEn: string[];
  duration: string;
  durationEn: string;
  price: string;
  stops: string[];
}
