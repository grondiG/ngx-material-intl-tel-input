import { AsyncPipe, NgClass, NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import {
  MAT_SELECT_CONFIG,
  MatSelect,
  MatSelectModule
} from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Observable, ReplaySubject, Subject, take, takeUntil } from 'rxjs';
import { CountryCode } from '../data/country-code';
import { Country } from '../types/country.model';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import TelValidators from '../validators/tel.validators';
import { GeoIpService } from '../services/geo-ip/geo-ip.service';
import { HttpClientModule } from '@angular/common/http';
import { GeoData } from '../types/geo.type';
import { TextLabels } from '../types/text-labels.type';
import { CountryISO } from '../enums/country-iso.enum';
import { CountryDataService } from '../services/country-data/country-data.service';

@Component({
  selector: 'ng ngx-material-intl-tel-input',
  standalone: true,
  imports: [
    AsyncPipe,
    MatSelectModule,
    NgxMatSelectSearchModule,
    ReactiveFormsModule,
    NgClass,
    MatFormFieldModule,
    MatInputModule,
    HttpClientModule,
    NgTemplateOutlet
  ],
  providers: [
    CountryCode,
    {
      provide: MAT_SELECT_CONFIG,
      useValue: { overlayPanelClass: 'tel-mat-select-pane' }
    },
    GeoIpService,
    CountryDataService
  ],
  templateUrl: './ngx-material-intl-tel-input-lib.component.html',
  styleUrl: './ngx-material-intl-tel-input-lib.component.scss'
})
export class NgxMaterialIntlTelInputComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  /** control for the selected country prefix */
  public prefixCtrl: FormControl<Country | null> =
    new FormControl<Country | null>(null);

  /** control for the MatSelect filter keyword */
  public prefixFilterCtrl: FormControl<string | null> = new FormControl<
    string | null
  >('');

  /** list of countries filtered by search keyword */
  public filteredCountries: ReplaySubject<Country[]> = new ReplaySubject<
    Country[]
  >(1);

  @ViewChild('singleSelect', { static: true }) singleSelect!: MatSelect;

  /** Subject that emits when the component has been destroyed. */
  protected _onDestroy = new Subject<void>();

  allCountries: Country[] = [];
  phoneNumberUtil = PhoneNumberUtil.getInstance();

  telForm = new FormGroup({
    prefixCtrl: this.prefixCtrl,
    numberControl: new FormControl('')
  });

  @Input() fieldControl = new FormControl('');
  @Input() required = false;
  @Input() disabled = false;
  @Input() enablePlaceholder = true;
  @Input() autoIpLookup = true;
  @Input() autoSelectCountry = true;
  @Input() autoSelectedCountry: CountryISO | string = '';
  @Input() numberValidation = true;
  @Input() iconMakeCall = true;
  @Input() initialValue = '';
  @Input() enableSearch = true;
  @Input() preferredCountries: (CountryISO | string)[] = [];
  @Input() visibleCountries: (CountryISO | string)[] = [];
  @Input() excludedCountries: (CountryISO | string)[] = [];
  @Input() textLabels: TextLabels = {
    mainLabel: 'Phone number',
    codePlaceholder: 'Code',
    searchPlaceholderLabel: 'Search',
    noEntriesFoundLabel: 'No countries found',
    nationalNumberLabel: 'Number',
    hintLabel: 'Select country and type your phone number',
    invalidNumberError: 'Number is not valid',
    requiredError: 'This field is required'
  };
  @Output() valueChanges: Observable<string | null> =
    this.fieldControl.valueChanges;

  isFocused = false;
  isLoading = true;

  constructor(
    private countryCodeData: CountryCode,
    private geoIpService: GeoIpService,
    private countryDataService: CountryDataService
  ) {}

  /**
   * Initialize the component and perform necessary setup tasks.
   *
   */
  ngOnInit(): void {
    this.fetchCountryData();
    if (this.required) {
      this.fieldControl.addValidators(Validators.required);
    }
    if (this.disabled) {
      this.telForm.disable();
      this.fieldControl.disable();
    }
    if (this.numberValidation) {
      this.fieldControl.addValidators(
        TelValidators.isValidNumber(this.telForm)
      );
    }
    // load the initial countries list
    this.filteredCountries.next(this.allCountries.slice());
    // listen for search field value changes
    this.prefixFilterCtrl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.filterCountries();
      });
    this.startTelFormValueChangesListener();
    setTimeout(() => {
      this.setInitialTelValue();
    });
  }

  /**
   * Fetches country data and populates the allCountries array.
   */
  protected fetchCountryData(): void {
    const processedCountries = this.countryDataService.processCountries(
      this.countryCodeData,
      this.enablePlaceholder,
      this.visibleCountries,
      this.preferredCountries,
      this.excludedCountries
    );
    this.allCountries = processedCountries;
  }

  /**
   * A lifecycle hook that is called after Angular has fully initialized a component's view.
   *
   * @return {void}
   */
  ngAfterViewInit(): void {
    this.setInitialPrefixValue();
  }

  /**
   * Method called when the component is destroyed.
   *
   */
  ngOnDestroy(): void {
    this._onDestroy.next();
    this._onDestroy.complete();
  }

  /**
   * Performs a geo IP lookup and sets the prefix control value based on the country retrieved.
   */
  geoIpLookup(): void {
    this.geoIpService.geoIpLookup().subscribe({
      next: (data: GeoData) => {
        const country =
          this.allCountries?.find(
            (c) => c.iso2 === data.country_code?.toLowerCase()
          ) || null;
        if (country) {
          this.prefixCtrl.setValue(country);
        } else {
          this.setAutoSelectedCountry();
        }
      },
      error: () => {
        this.setAutoSelectedCountry();
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  /**
   * Sets the initial value after the filteredCountries are loaded initially
   */
  protected setInitialPrefixValue(): void {
    this.filteredCountries
      .pipe(take(1), takeUntil(this._onDestroy))
      .subscribe(() => {
        // setting the compareWith property to a comparison function
        // triggers initializing the selection according to the initial value of
        // the form control (i.e. _initializeSelection())
        // this needs to be done after the filteredCountries are loaded initially
        // and after the mat-option elements are available
        this.singleSelect.compareWith = (a: Country, b: Country) =>
          a && b && a.iso2 === b.iso2;
      });
  }

  /**
   * Method to filter the list of countries based on a search keyword.
   *
   */
  protected filterCountries(): void {
    if (!this.allCountries) {
      return;
    }
    // get the search keyword
    let search = this.prefixFilterCtrl.value || '';
    if (!search) {
      this.filteredCountries.next(this.allCountries.slice());
      return;
    } else {
      search = search.toLowerCase();
    }
    // filter the countries
    this.filteredCountries.next(
      this.allCountries.filter(
        (country) => country?.name?.toLowerCase()?.indexOf(search) > -1
      )
    );
  }

  /**
   * A method that handles the focus event for the input.
   *
   */
  onInputFocus(): void {
    this.isFocused = true;
  }

  /**
   * A method that handles the blur event for the input.
   */
  onInputBlur(): void {
    this.isFocused = false;
  }

  /**
   * Listens for changes in the telForm value and updates the fieldControl accordingly.
   */
  startTelFormValueChangesListener(): void {
    this.telForm.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe((data) => {
        if (data?.numberControl) {
          this.fieldControl?.markAsDirty();
          let value = '';
          if (data?.prefixCtrl?.dialCode) {
            value = '+' + data.prefixCtrl.dialCode + data.numberControl;
          } else {
            value = data.numberControl;
          }
          try {
            const parsed = this.phoneNumberUtil.parse(
              value,
              data?.prefixCtrl?.iso2
            );
            const formatted = this.phoneNumberUtil.format(
              parsed,
              PhoneNumberFormat.INTERNATIONAL
            );
            this.fieldControl.setValue(formatted);
          } catch (error) {
            this.fieldControl.setValue(value);
          }
        } else {
          this.fieldControl.setValue('');
        }
      });
  }

  /**
   * Sets the initial telephone value based on the initial value.
   */
  setInitialTelValue(): void {
    if (!this.initialValue) {
      // set initial selection
      if (this.autoSelectCountry) {
        if (this.autoIpLookup) {
          this.geoIpLookup();
        } else {
          this.setAutoSelectedCountry();
          this.isLoading = false;
        }
      } else {
        this.isLoading = false;
      }
    } else {
      try {
        const parsedNumber = this.phoneNumberUtil.parse(this.initialValue);
        const countryCode = parsedNumber.getCountryCode();
        const country = this.allCountries?.find(
          (c) => c.dialCode === `${countryCode}`
        );
        if (country) {
          this.prefixCtrl.setValue(country);
        }
        const nationalNumber =
          parsedNumber?.getNationalNumber()?.toString() || '';
        if (nationalNumber) {
          this.telForm.get('numberControl')?.setValue(nationalNumber);
        }
      } catch {
        this.telForm.get('numberControl')?.setValue(this.initialValue);
        this.fieldControl.setValue(this.initialValue);
        this.fieldControl?.markAsDirty();
      } finally {
        this.isLoading = false;
      }
    }
  }

  /**
   * Set the auto selected country based on the specified criteria.
   *
   */
  setAutoSelectedCountry(): void {
    const autoSelectedCountry = this.allCountries?.find(
      (country) => country?.iso2 === this.autoSelectedCountry
    );
    if (autoSelectedCountry) {
      this.prefixCtrl.setValue(autoSelectedCountry);
    } else {
      const defaultCountry = this.allCountries?.find(
        (country) => country?.iso2 === CountryISO.Spain
      );
      if (defaultCountry) {
        this.prefixCtrl.setValue(defaultCountry);
      } else {
        this.prefixCtrl.setValue(this.allCountries?.[0]);
      }
    }
  }
}
