import { Injectable } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { catchError, map, tap, pluck, concatMap, take, switchMap, switchMapTo, defaultIfEmpty } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TagPlaceholder } from '@angular/compiler/src/i18n/i18n_ast';
import { AddressCandidate } from './addressCandidate';

@Injectable({
  providedIn: 'root'
})
export class GeocodeService {

  private geocodeUrl = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

  constructor(private http: HttpClient) { }


  geocode(location: string): Observable<AddressCandidate> {
    const url = `${this.geocodeUrl}?f=json&SingleLine=${location}`;
    return (this.http.get(url)
      .pipe(
        switchMap(x => from(x['candidates'])),
        defaultIfEmpty(null),
        take(1),  // candidates ordered by score, return the best match
        // tap(data => console.log('candidate: ', data)),
        catchError(this.handleError('geocode', null))
      )
    );
  }

  /**
   * Handle Http operation that failed.
   * Let the app continue.
   * @param operation - name of the operation that failed
   * @param result - optional value to return as the observable result
   * --- taken from tutorial at angular.io ---
   */
  private handleError<T> (operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {

      console.error(error);

      // Let the app keep running by returning an empty result.
      return of(result as T);
    };
  }
}
