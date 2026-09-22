/**
 * "Regional bank (sample)": three WSDLs the way they arrive from an
 * estate — a WCF document/literal service with an imported XSD, a Java EE
 * rpc/literal service with inline types, and a WSDL 2.0 service. Labelled
 * as a sample wherever it is shown.
 */

const ACCOUNT_XSD = `<?xml version="1.0" encoding="utf-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:tns="http://bank.example.com/accounts/types"
           targetNamespace="http://bank.example.com/accounts/types"
           elementFormDefault="qualified">
  <xs:simpleType name="AccountStatus">
    <xs:restriction base="xs:string">
      <xs:enumeration value="Active"/>
      <xs:enumeration value="Dormant"/>
      <xs:enumeration value="Closed"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="Iban">
    <xs:restriction base="xs:string">
      <xs:pattern value="[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}"/>
      <xs:minLength value="15"/>
      <xs:maxLength value="34"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Money">
    <xs:annotation><xs:documentation>An amount with its ISO 4217 currency as an attribute.</xs:documentation></xs:annotation>
    <xs:simpleContent>
      <xs:extension base="xs:decimal">
        <xs:attribute name="currency" type="xs:string" use="required"/>
      </xs:extension>
    </xs:simpleContent>
  </xs:complexType>
  <xs:complexType name="Address">
    <xs:sequence>
      <xs:element name="Line1" type="xs:string"/>
      <xs:element name="Line2" type="xs:string" minOccurs="0" nillable="true"/>
      <xs:element name="City" type="xs:string"/>
      <xs:choice>
        <xs:element name="Postcode" type="xs:string"/>
        <xs:element name="ZipCode" type="xs:string"/>
      </xs:choice>
      <xs:element name="Country" type="xs:string" default="GB"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Account">
    <xs:sequence>
      <xs:element name="AccountId" type="xs:string"/>
      <xs:element name="Iban" type="tns:Iban"/>
      <xs:element name="CustomerId" type="xs:string"/>
      <xs:element name="Status" type="tns:AccountStatus"/>
      <xs:element name="OpenedOn" type="xs:date"/>
      <xs:element name="Address" type="tns:Address" minOccurs="0"/>
      <xs:element name="Metadata" minOccurs="0">
        <xs:complexType>
          <xs:sequence>
            <xs:any processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:sequence>
    <xs:attribute name="version" type="xs:int"/>
  </xs:complexType>
  <xs:complexType name="Balance">
    <xs:sequence>
      <xs:element name="AccountId" type="xs:string"/>
      <xs:element name="Available" type="tns:Money"/>
      <xs:element name="Ledger" type="tns:Money"/>
      <xs:element name="AsOf" type="xs:dateTime"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Transaction">
    <xs:sequence>
      <xs:element name="TransactionId" type="xs:string"/>
      <xs:element name="BookedOn" type="xs:dateTime"/>
      <xs:element name="Amount" type="tns:Money"/>
      <xs:element name="Description" type="xs:string" minOccurs="0"/>
      <xs:element name="Counterparty" type="tns:Counterparty" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Counterparty">
    <xs:sequence>
      <xs:element name="Name" type="xs:string"/>
      <xs:element name="Iban" type="tns:Iban" minOccurs="0"/>
      <xs:element name="Parent" type="tns:Counterparty" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="ArrayOfTransaction">
    <xs:sequence>
      <xs:element name="Transaction" type="tns:Transaction" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="ArrayOfAccount">
    <xs:sequence>
      <xs:element name="Account" type="tns:Account" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="ServiceFault">
    <xs:sequence>
      <xs:element name="Code" type="xs:string"/>
      <xs:element name="Message" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="AccountNotFoundFault" type="tns:ServiceFault"/>
  <xs:element name="InsufficientFundsFault" type="tns:ServiceFault"/>
  <xs:element name="ValidationFault" type="tns:ServiceFault"/>
</xs:schema>`;

const ACCOUNT_WSDL = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions name="AccountService"
    targetNamespace="http://bank.example.com/accounts"
    xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
    xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
    xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:tns="http://bank.example.com/accounts"
    xmlns:t="http://bank.example.com/accounts/types">
  <wsdl:documentation>Current accounts: balances, transactions, opening and closing, transfers. WCF, 2011.</wsdl:documentation>
  <wsdl:types>
    <xs:schema targetNamespace="http://bank.example.com/accounts" elementFormDefault="qualified">
      <xs:import namespace="http://bank.example.com/accounts/types" schemaLocation="Account.xsd"/>
      <xs:element name="GetAccountBalance">
        <xs:complexType><xs:sequence>
          <xs:element name="AccountId" type="xs:string"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="GetAccountBalanceResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="GetAccountBalanceResult" type="t:Balance"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="GetAccountTransactions">
        <xs:complexType><xs:sequence>
          <xs:element name="AccountId" type="xs:string"/>
          <xs:element name="From" type="xs:date" minOccurs="0"/>
          <xs:element name="To" type="xs:date" minOccurs="0"/>
          <xs:element name="MaxResults" type="xs:int" minOccurs="0" default="50"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="GetAccountTransactionsResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="GetAccountTransactionsResult" type="t:ArrayOfTransaction"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="FindAccountsByCustomer">
        <xs:complexType><xs:sequence>
          <xs:element name="CustomerId" type="xs:string"/>
          <xs:element name="IncludeClosed" type="xs:boolean" minOccurs="0"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="FindAccountsByCustomerResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="FindAccountsByCustomerResult" type="t:ArrayOfAccount"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="OpenAccount">
        <xs:complexType><xs:sequence>
          <xs:element name="CustomerId" type="xs:string"/>
          <xs:element name="Address" type="t:Address"/>
          <xs:element name="InitialDeposit" type="t:Money" minOccurs="0"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="OpenAccountResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="OpenAccountResult" type="t:Account"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="UpdateAccountAddress">
        <xs:complexType><xs:sequence>
          <xs:element name="AccountId" type="xs:string"/>
          <xs:element name="Address" type="t:Address"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="UpdateAccountAddressResponse">
        <xs:complexType><xs:sequence/></xs:complexType>
      </xs:element>
      <xs:element name="CloseAccount">
        <xs:complexType><xs:sequence>
          <xs:element name="AccountId" type="xs:string"/>
          <xs:element name="Reason" type="xs:string" minOccurs="0"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="CloseAccountResponse">
        <xs:complexType><xs:sequence/></xs:complexType>
      </xs:element>
      <xs:element name="TransferFunds">
        <xs:complexType><xs:sequence>
          <xs:element name="FromAccountId" type="xs:string"/>
          <xs:element name="ToAccountId" type="xs:string"/>
          <xs:element name="Amount" type="t:Money"/>
          <xs:element name="Reference" type="xs:string" minOccurs="0"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="TransferFundsResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="TransferFundsResult" type="xs:string"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="ValidateIban">
        <xs:complexType><xs:sequence>
          <xs:element name="Iban" type="xs:string"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="ValidateIbanResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="ValidateIbanResult" type="xs:boolean"/>
        </xs:sequence></xs:complexType>
      </xs:element>
    </xs:schema>
  </wsdl:types>

  <wsdl:message name="GetAccountBalanceRequest"><wsdl:part name="parameters" element="tns:GetAccountBalance"/></wsdl:message>
  <wsdl:message name="GetAccountBalanceResponse"><wsdl:part name="parameters" element="tns:GetAccountBalanceResponse"/></wsdl:message>
  <wsdl:message name="GetAccountTransactionsRequest"><wsdl:part name="parameters" element="tns:GetAccountTransactions"/></wsdl:message>
  <wsdl:message name="GetAccountTransactionsResponse"><wsdl:part name="parameters" element="tns:GetAccountTransactionsResponse"/></wsdl:message>
  <wsdl:message name="FindAccountsByCustomerRequest"><wsdl:part name="parameters" element="tns:FindAccountsByCustomer"/></wsdl:message>
  <wsdl:message name="FindAccountsByCustomerResponse"><wsdl:part name="parameters" element="tns:FindAccountsByCustomerResponse"/></wsdl:message>
  <wsdl:message name="OpenAccountRequest"><wsdl:part name="parameters" element="tns:OpenAccount"/></wsdl:message>
  <wsdl:message name="OpenAccountResponse"><wsdl:part name="parameters" element="tns:OpenAccountResponse"/></wsdl:message>
  <wsdl:message name="UpdateAccountAddressRequest"><wsdl:part name="parameters" element="tns:UpdateAccountAddress"/></wsdl:message>
  <wsdl:message name="UpdateAccountAddressResponse"><wsdl:part name="parameters" element="tns:UpdateAccountAddressResponse"/></wsdl:message>
  <wsdl:message name="CloseAccountRequest"><wsdl:part name="parameters" element="tns:CloseAccount"/></wsdl:message>
  <wsdl:message name="CloseAccountResponse"><wsdl:part name="parameters" element="tns:CloseAccountResponse"/></wsdl:message>
  <wsdl:message name="TransferFundsRequest"><wsdl:part name="parameters" element="tns:TransferFunds"/></wsdl:message>
  <wsdl:message name="TransferFundsResponse"><wsdl:part name="parameters" element="tns:TransferFundsResponse"/></wsdl:message>
  <wsdl:message name="ValidateIbanRequest"><wsdl:part name="parameters" element="tns:ValidateIban"/></wsdl:message>
  <wsdl:message name="ValidateIbanResponse"><wsdl:part name="parameters" element="tns:ValidateIbanResponse"/></wsdl:message>
  <wsdl:message name="AccountNotFoundFault"><wsdl:part name="detail" element="t:AccountNotFoundFault"/></wsdl:message>
  <wsdl:message name="InsufficientFundsFault"><wsdl:part name="detail" element="t:InsufficientFundsFault"/></wsdl:message>
  <wsdl:message name="ValidationFault"><wsdl:part name="detail" element="t:ValidationFault"/></wsdl:message>

  <wsdl:portType name="IAccountService">
    <wsdl:operation name="GetAccountBalance">
      <wsdl:documentation>The available and ledger balance of one account.</wsdl:documentation>
      <wsdl:input message="tns:GetAccountBalanceRequest"/>
      <wsdl:output message="tns:GetAccountBalanceResponse"/>
      <wsdl:fault name="AccountNotFoundFault" message="tns:AccountNotFoundFault"/>
    </wsdl:operation>
    <wsdl:operation name="GetAccountTransactions">
      <wsdl:input message="tns:GetAccountTransactionsRequest"/>
      <wsdl:output message="tns:GetAccountTransactionsResponse"/>
      <wsdl:fault name="AccountNotFoundFault" message="tns:AccountNotFoundFault"/>
    </wsdl:operation>
    <wsdl:operation name="FindAccountsByCustomer">
      <wsdl:input message="tns:FindAccountsByCustomerRequest"/>
      <wsdl:output message="tns:FindAccountsByCustomerResponse"/>
    </wsdl:operation>
    <wsdl:operation name="OpenAccount">
      <wsdl:input message="tns:OpenAccountRequest"/>
      <wsdl:output message="tns:OpenAccountResponse"/>
      <wsdl:fault name="ValidationFault" message="tns:ValidationFault"/>
    </wsdl:operation>
    <wsdl:operation name="UpdateAccountAddress">
      <wsdl:input message="tns:UpdateAccountAddressRequest"/>
      <wsdl:output message="tns:UpdateAccountAddressResponse"/>
      <wsdl:fault name="AccountNotFoundFault" message="tns:AccountNotFoundFault"/>
      <wsdl:fault name="ValidationFault" message="tns:ValidationFault"/>
    </wsdl:operation>
    <wsdl:operation name="CloseAccount">
      <wsdl:input message="tns:CloseAccountRequest"/>
      <wsdl:output message="tns:CloseAccountResponse"/>
      <wsdl:fault name="AccountNotFoundFault" message="tns:AccountNotFoundFault"/>
    </wsdl:operation>
    <wsdl:operation name="TransferFunds">
      <wsdl:input message="tns:TransferFundsRequest"/>
      <wsdl:output message="tns:TransferFundsResponse"/>
      <wsdl:fault name="AccountNotFoundFault" message="tns:AccountNotFoundFault"/>
      <wsdl:fault name="InsufficientFundsFault" message="tns:InsufficientFundsFault"/>
    </wsdl:operation>
    <wsdl:operation name="ValidateIban">
      <wsdl:input message="tns:ValidateIbanRequest"/>
      <wsdl:output message="tns:ValidateIbanResponse"/>
    </wsdl:operation>
  </wsdl:portType>

  <wsdl:binding name="BasicHttpBinding_IAccountService" type="tns:IAccountService">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="GetAccountBalance">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/GetAccountBalance" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
      <wsdl:fault name="AccountNotFoundFault"><soap:fault name="AccountNotFoundFault" use="literal"/></wsdl:fault>
    </wsdl:operation>
    <wsdl:operation name="GetAccountTransactions">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/GetAccountTransactions" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="FindAccountsByCustomer">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/FindAccountsByCustomer" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="OpenAccount">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/OpenAccount" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="UpdateAccountAddress">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/UpdateAccountAddress" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="CloseAccount">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/CloseAccount" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="TransferFunds">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/TransferFunds" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="ValidateIban">
      <soap:operation soapAction="http://bank.example.com/accounts/IAccountService/ValidateIban" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:binding name="WsHttpBinding_IAccountService" type="tns:IAccountService">
    <soap12:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="GetAccountBalance">
      <soap12:operation soapAction="http://bank.example.com/accounts/IAccountService/GetAccountBalance" style="document"/>
      <wsdl:input><soap12:body use="literal"/></wsdl:input>
      <wsdl:output><soap12:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <wsdl:service name="AccountService">
    <wsdl:port name="BasicHttpBinding_IAccountService" binding="tns:BasicHttpBinding_IAccountService">
      <soap:address location="https://esb.bank.example.com/services/AccountService.svc"/>
    </wsdl:port>
    <wsdl:port name="WsHttpBinding_IAccountService" binding="tns:WsHttpBinding_IAccountService">
      <soap12:address location="https://esb.bank.example.com/services/AccountService.svc/ws"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;

const WAREHOUSE_WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="WarehouseService"
    targetNamespace="http://logistics.bank.example.com/warehouse"
    xmlns="http://schemas.xmlsoap.org/wsdl/"
    xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:tns="http://logistics.bank.example.com/warehouse">
  <documentation>Stock levels and reservations for the branch supplies warehouse. Java EE, rpc/literal, 2008.</documentation>
  <types>
    <xsd:schema targetNamespace="http://logistics.bank.example.com/warehouse">
      <xsd:complexType name="StockLevel">
        <xsd:sequence>
          <xsd:element name="sku" type="xsd:string"/>
          <xsd:element name="warehouseCode" type="xsd:string"/>
          <xsd:element name="onHand" type="xsd:int"/>
          <xsd:element name="reserved" type="xsd:int"/>
          <xsd:element name="lastCounted" type="xsd:dateTime" nillable="true"/>
        </xsd:sequence>
      </xsd:complexType>
      <xsd:complexType name="Warehouse">
        <xsd:sequence>
          <xsd:element name="code" type="xsd:string"/>
          <xsd:element name="name" type="xsd:string"/>
          <xsd:element name="region" type="xsd:string" minOccurs="0"/>
        </xsd:sequence>
      </xsd:complexType>
      <xsd:complexType name="WarehouseList">
        <xsd:sequence>
          <xsd:element name="warehouse" type="tns:Warehouse" minOccurs="0" maxOccurs="unbounded"/>
        </xsd:sequence>
      </xsd:complexType>
      <xsd:complexType name="Reservation">
        <xsd:sequence>
          <xsd:element name="reservationId" type="xsd:string"/>
          <xsd:element name="sku" type="xsd:string"/>
          <xsd:element name="quantity" type="xsd:positiveInteger"/>
          <xsd:element name="expires" type="xsd:dateTime"/>
        </xsd:sequence>
      </xsd:complexType>
    </xsd:schema>
  </types>
  <message name="getStockLevelRequest">
    <part name="sku" type="xsd:string"/>
    <part name="warehouseCode" type="xsd:string"/>
  </message>
  <message name="getStockLevelResponse"><part name="return" type="tns:StockLevel"/></message>
  <message name="listWarehousesRequest"/>
  <message name="listWarehousesResponse"><part name="return" type="tns:WarehouseList"/></message>
  <message name="reserveStockRequest">
    <part name="sku" type="xsd:string"/>
    <part name="quantity" type="xsd:int"/>
    <part name="warehouseCode" type="xsd:string"/>
  </message>
  <message name="reserveStockResponse"><part name="return" type="tns:Reservation"/></message>
  <message name="releaseReservationRequest"><part name="reservationId" type="xsd:string"/></message>
  <message name="releaseReservationResponse"/>
  <message name="stockFault"><part name="reason" type="xsd:string"/></message>

  <portType name="Warehouse">
    <operation name="getStockLevel">
      <input message="tns:getStockLevelRequest"/>
      <output message="tns:getStockLevelResponse"/>
      <fault name="UnknownSkuException" message="tns:stockFault"/>
    </operation>
    <operation name="listWarehouses">
      <input message="tns:listWarehousesRequest"/>
      <output message="tns:listWarehousesResponse"/>
    </operation>
    <operation name="reserveStock">
      <input message="tns:reserveStockRequest"/>
      <output message="tns:reserveStockResponse"/>
      <fault name="InsufficientStockException" message="tns:stockFault"/>
    </operation>
    <operation name="releaseReservation">
      <input message="tns:releaseReservationRequest"/>
      <output message="tns:releaseReservationResponse"/>
    </operation>
  </portType>

  <binding name="WarehouseSoapBinding" type="tns:Warehouse">
    <soap:binding style="rpc" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="getStockLevel">
      <soap:operation soapAction="urn:warehouse:getStockLevel"/>
      <input><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></input>
      <output><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></output>
    </operation>
    <operation name="listWarehouses">
      <soap:operation soapAction="urn:warehouse:listWarehouses"/>
      <input><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></input>
      <output><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></output>
    </operation>
    <operation name="reserveStock">
      <soap:operation soapAction="urn:warehouse:reserveStock"/>
      <input><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></input>
      <output><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></output>
    </operation>
    <operation name="releaseReservation">
      <soap:operation soapAction="urn:warehouse:releaseReservation"/>
      <input><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></input>
      <output><soap:body use="literal" namespace="http://logistics.bank.example.com/warehouse"/></output>
    </operation>
  </binding>
  <service name="WarehouseService">
    <port name="WarehousePort" binding="tns:WarehouseSoapBinding">
      <soap:address location="http://esb.bank.example.com:8080/warehouse/services/Warehouse"/>
    </port>
  </service>
</definitions>`;

const NOTIFICATION_WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<description xmlns="http://www.w3.org/ns/wsdl"
    targetNamespace="http://bank.example.com/notifications"
    xmlns:tns="http://bank.example.com/notifications"
    xmlns:wsoap="http://www.w3.org/ns/wsdl/soap"
    xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <documentation>Customer notifications by SMS and email. WSDL 2.0, SOAP 1.2.</documentation>
  <types>
    <xs:schema targetNamespace="http://bank.example.com/notifications" elementFormDefault="qualified">
      <xs:simpleType name="Channel">
        <xs:restriction base="xs:string">
          <xs:enumeration value="SMS"/>
          <xs:enumeration value="EMAIL"/>
          <xs:enumeration value="PUSH"/>
        </xs:restriction>
      </xs:simpleType>
      <xs:element name="SendNotification">
        <xs:complexType><xs:sequence>
          <xs:element name="CustomerId" type="xs:string"/>
          <xs:element name="Channel" type="tns:Channel"/>
          <xs:element name="Message" type="xs:string"/>
          <xs:element name="Tags" type="xs:string" minOccurs="0" maxOccurs="5"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="GetNotificationStatus">
        <xs:complexType><xs:sequence>
          <xs:element name="NotificationId" type="xs:string"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="GetNotificationStatusResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="NotificationId" type="xs:string"/>
          <xs:element name="Delivered" type="xs:boolean"/>
          <xs:element name="DeliveredAt" type="xs:dateTime" nillable="true"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="NotificationNotFound">
        <xs:complexType><xs:sequence>
          <xs:element name="NotificationId" type="xs:string"/>
        </xs:sequence></xs:complexType>
      </xs:element>
    </xs:schema>
  </types>
  <interface name="NotificationInterface">
    <fault name="NotFound" element="tns:NotificationNotFound"/>
    <operation name="SendNotification" pattern="http://www.w3.org/ns/wsdl/in-only">
      <input messageLabel="In" element="tns:SendNotification"/>
    </operation>
    <operation name="GetNotificationStatus" pattern="http://www.w3.org/ns/wsdl/in-out">
      <input messageLabel="In" element="tns:GetNotificationStatus"/>
      <output messageLabel="Out" element="tns:GetNotificationStatusResponse"/>
      <outfault ref="tns:NotFound" messageLabel="Out"/>
    </operation>
  </interface>
  <binding name="NotificationSoapBinding" interface="tns:NotificationInterface"
      type="http://www.w3.org/ns/wsdl/soap" wsoap:protocol="http://www.w3.org/2003/05/soap/bindings/HTTP/" wsoap:version="1.2">
    <operation ref="tns:SendNotification" wsoap:action="urn:notifications:send"/>
    <operation ref="tns:GetNotificationStatus" wsoap:action="urn:notifications:status"/>
  </binding>
  <service name="NotificationService" interface="tns:NotificationInterface">
    <endpoint name="NotificationEndpoint" binding="tns:NotificationSoapBinding" address="https://esb.bank.example.com/notifications"/>
  </service>
</description>`;

export const SAMPLE_PROGRAMME = {
  name: "Regional bank (sample)",
  services: [
    { name: "AccountService", fileName: "AccountService.wsdl", wsdl: ACCOUNT_WSDL, attachments: { "Account.xsd": ACCOUNT_XSD }, traffic: { GetAccountBalance: 412000, GetAccountTransactions: 188000, FindAccountsByCustomer: 96000, OpenAccount: 1200, UpdateAccountAddress: 3400, CloseAccount: 300, TransferFunds: 74000, ValidateIban: 51000 } },
    { name: "WarehouseService", fileName: "WarehouseService.wsdl", wsdl: WAREHOUSE_WSDL, attachments: {}, traffic: { getStockLevel: 22000, listWarehouses: 800, reserveStock: 6100, releaseReservation: 4900 } },
    { name: "NotificationService", fileName: "NotificationService.wsdl", wsdl: NOTIFICATION_WSDL, attachments: {}, traffic: { SendNotification: 240000, GetNotificationStatus: 31000 } },
  ],
};

export const SAMPLE_WSDL = ACCOUNT_WSDL;
export const SAMPLE_XSD = ACCOUNT_XSD;
