import { Component, OnInit } from '@angular/core';
import { GeocodeService } from '../geocode.service';


@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent implements OnInit {

  constructor(private geocodeService: GeocodeService) { }
  coordinates: Map<string, number>;

  ngOnInit() {
  }

  lookupLocation(location: string) {
    if (location) {
      console.log('searching for ' + location);
      this.coordinates = null;

      this.geocodeService.geocode(location)
        .subscribe (
          candidate => {
            if (candidate) {
              console.log('candidate: ', candidate);
              this.coordinates = candidate['location'];
            } else {
              console.log('no match');
            }
          }
        );
    }
  }
}
