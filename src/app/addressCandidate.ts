export interface AddressCandidate {
    address: string;
    location: Map<string, number>;
    score: number;
    attributes: Map<string, string>;
    extent: Map<string, number>;
}
